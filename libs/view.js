"use strict";

var _ = require('underscore'),
	fs = require('fs'),
	mime = require('mime'),
	EventEmitter = require('events').EventEmitter,
	utilities = require('./utilities'),
	BackboneGenerator = require('./BackboneGenerator');

var GOZY_RMI = BackboneGenerator.GOZY_RMI, GOZY_DGT = BackboneGenerator.GOZY_DGT;
var ACCEPT_URL = 'accept-url',
	ACCEPT_METHOD = 'accept-method',
	TEMPLATE = 'template', CONTENT = 'content', 
	BACKBONE = 'backbone', BACKBONE_MODEL = 'model', BACKBONE_COLLECTION = 'collection', 
	DEFAULT_TEMPLATE = 'default_template', DEFAULT_LOCALE = 'default_locale',
	MIME = 'mime';

var view_urls = [], view_map = {};

exports.control = function (request, response) {
	var path = request.pathname(),
		method = request.method(),
		accept = request.accept();
	
	if(!response.Redirect) {
		response.Redirect = function (url) {
			return exports.control(request._rewriteRequest('GET', url), response);
		};
	}
	if(!view_map) {
		global.gozy.error('No controllers bound');
		return response.NotFound().commit();
	}
	
	if(request.method() === 'POST' || request.method() === 'PUT' || request.method() === 'PATCH') {
		var content_length = request.contentLength();
		
		if(content_length < 0 || isNaN(content_length))
			return response.LengthRequired().commit();
		if(content_length > 0 && !request.body()) {
			return response.NotAcceptable()
						.appendHeader('accept_encoding', ['application/json', 'application/x-www-urlencoded', 'multipart/form-data'].join(','))
						.appendHeader('accept_charset', ['UTF-8'].join(','))
						.commit();
		}
	} else if(request.isBackboneRequest()) {
		request._headers.accept = 'text/javascript';
		accept = ['text/javascript'];
	}
	
	if(request.header(GOZY_RMI) && request.header(GOZY_DGT) && request.method() === 'POST') return _control_rmi(request, response);
	
	var match = null, llen = 0, mna = [], emit_any = false;
	
	for(var i=0; i<view_urls.length; i++) {
		if(view_urls[i].test(path)) {
			var _urlstr = view_urls[i].toString(),
				vm = view_map[_urlstr];
				
			if(vm[method]) { 
				var url_len = _urlstr.split('\/').length;
				if(url_len > llen) {
					llen = url_len;
					match = vm[method]; 
				}
			} else {
				var allowed = _.keys(vm);
				for(var j=0; j<allowed.length; j++) mna.push(allowed[j]);
			}
		}
	}
	
	if(!match) {
		if(mna.length === 0) return response.NotFound().commit();
		else return response.MethodNotAllowed(mna.join(',')).commit();
	}  

	var emit = function (evt, match) {
		response._target_view = match;
		
		if(match.listeners('prerequest').length > 0) {
			return match.emit('prerequest', request, response, function (preq_args) {
				return match.emit(evt, request, response, preq_args);
			});
		} else
			return match.emit(evt, request, response);
	};
	
	for(var i=0; i<accept.length; i++) {
		if(match.listeners(accept[i]).slice(0).length > 0)
			return emit(accept[i], match);
		else if(accept[i] === '*/*')
			emit_any = true;
	}
		
	var events = _.keys(match._events), acceptable = [];
	for(var i=0; i< events.length; i++) {
		if(!/^.+\/.+$/.test(events[i])) continue;
		
		var event = match._events[events[i]];
		if(typeof event === 'function' || (Array.isArray(event) && event.length > 0)) {
			if(emit_any && events[i] !== match._backbone_prevention) // Client requests '*/*' but no controllers found
				return emit(events[i], match);

			acceptable.push(events[i]);
		}
	}
	
	if(match.listeners('*/*').slice(0).length > 0)
		return emit('*/*', match);
			
	return response.NotAcceptable().appendHeader('accept', acceptable.join(',')).commit();
};

function _control_rmi (request, response) {
	var path = request.pathname(),
		method = request.header(GOZY_DGT),
		rrmi = request.header(GOZY_RMI),
		rmi = null;
		
	var match = null, llen = 0;
	for(var i=0; i<view_urls.length; i++) {
		if(view_urls[i].test(path)) {
			var _urlstr = view_urls[i].toString(),
				vm = view_map[_urlstr];
			
			if(vm[method]) { 
				var url_len = _urlstr.split('\/').length;
				if(url_len > llen) {
					llen = url_len;
					match = vm[method]; 
				}
			}
		}
	}
	
	if(!match) return response.NotFound().commit();

	for(var i=0; i<match._backbone_rmi.length; i++) 
		if(match._backbone_rmi[i] === rrmi) rmi = rrmi;
	
	if(!rmi) return response.NotFound().commit();
	
	for(var i=0; i<request._body.length; i++)
		request[i] = request._body[i];
	
	var response_func = (function (_response) {
		return function () {
			var response_arr = [];
			for(var i=0; i<arguments.length; i++) {
				if(typeof arguments[i] === 'function') throw new Error('An argument for Gozy RMI Response cannot be a function: at ' + i);
				response_arr.push(arguments[i]);
			}
			response.OK().json(response_arr).commit();
		};
	})(response);
	 
	response._target_view = match;
		
	if(match.listeners(rmi).length === 0) return response.NotFound().commit();
	
	if(match.listeners('prerequest').length > 0) {
		return match.emit('prerequest', request, response, function (preq_args) {
			return match.emit(rmi, request, response_func, preq_args);
		});
	} else
		return match.emit(rmi, request, response_func);
}

exports.View = function (obj, options) {
	/* Called by individual veiw scripts as 'require('gozy').View~' */
	_.extend(obj, new EventEmitter());

	var accept_url, accept_method;
		
	try {
		accept_url = options[ACCEPT_URL];
		accept_method = options[ACCEPT_METHOD];
		 
		if(!accept_url) throw new Error(ACCEPT_URL + ' is not defined');
		else if(!(accept_url instanceof RegExp)) accept_url = new RegExp('^' + accept_url + '$');
		if(!accept_method) throw new Error(ACCEPT_METHOD + ' is not defined');
	} catch (err) {
		global.gozy.error(err);
		return process.exit(1);
	}
	
	if(!view_map[accept_url]) view_map[accept_url] = {};
	if(view_map[accept_url][accept_method]) {
		global.gozy.warn('Views considered as the same are exist', {
			'accept-url': options[ACCEPT_URL].toString(), 'accept-method': options[ACCEPT_METHOD]
		});
	}
	
	if(options && options[BACKBONE]) {
		if(!options[BACKBONE].Type) throw new Error('Backbone must be set "Type" property as either "model" or "collection"');
		if(options[BACKBONE].Type !== BACKBONE_COLLECTION && options[BACKBONE].Type !== BACKBONE_MODEL) throw new Error('Backbone must be set "Type" property as either "' + BACKBONE_MODEL + '" or "' + BACKBONE_COLLECTION + '"');
		
		if(options && options[TEMPLATE])
			throw new Error('Template view cannot be Backbone Model provider');
		if(options && options[CONTENT])
			contentEnabledView(obj, options, options[BACKBONE].Type);
	} else {
		if(options && options[TEMPLATE])
			templateEnabledView(obj, options);
		if(options && options[CONTENT])
			contentEnabledView(obj, options, false);
	}
	
	view_map[accept_url.toString()][accept_method] = obj;
	view_urls.push(accept_url);
	
	obj.emit('initialize');
};

exports.bind = function (view_path, obj) {
	var file_count = utilities.requireAllJS(view_path);
	global.gozy.info(file_count + ' views found');
};

function templateEnabledView(view, options) {	
	var parseTemplateObject = function (template_name, locale, filename) {
		if(!view._render_target) view._render_target = { }; 
		if(!view._render_target[template_name]) view._render_target[template_name] = { };
		if(!view._render_target_mime) view._render_target_mime = { }; 
		
		if(!fs.existsSync(filename)) {
			global.gozy.error('View template "' + fs.realpathSync(filename) + '" is not found');
			return false;
		} 
		
		view._render_target_mime[template_name] = mime.lookup(filename);
		
		switch(view._render_target_mime[template_name]) {
		case 'application/json':
		case 'text/html':
		case 'text/css':
		case 'text/javascript':
			view._render_target[template_name][locale] = fs.readFileSync(filename).toString();
			view._isString = true;
			view._isTemplate = true;
			break;
		default:
			view._render_target[template_name][locale] = fs.readFileSync(filename);
			view._isString = false;  
			view._isTemplate = true;
		}
		
		return true;
	};
	
	var default_template = options[DEFAULT_TEMPLATE],
		default_locale = options[DEFAULT_LOCALE];
	
	if(typeof options[TEMPLATE] === 'string') {
		default_template = default_template || 'default_1';
		default_locale = default_locale || 'en-us';
	
		if(!parseTemplateObject(default_template, default_locale, options[TEMPLATE]))
			return;
	} else if (typeof options[TEMPLATE] === 'object') {
		for(var template in options[TEMPLATE]) {
			if(typeof options[TEMPLATE][template] === 'string') {
				default_template = default_template || 'default_1';
				default_locale = default_locale || template; /* in this case template means locale */
		
				if(!parseTemplateObject(default_template, default_locale, options[TEMPLATE][template]))
					return;
				break;
			}
			
			for(var locale in options[TEMPLATE][template]) {
				default_template = default_template || template;
				default_locale = default_locale || locale;
				 
				if(!parseTemplateObject(template, locale, options[TEMPLATE][template][locale]))
					return;
			}
		}
	} else
		throw new Error('template must be one of : filename, object(locale: filename)');
	
	view._default_template = default_template;
	view._default_locale = default_locale;
	view._content_func = _content_func;
	view._mime_func = _mime_func;
	/*view.updateTemplate = _updateTemplate;*/
}

function contentEnabledView(view, options, isBackbone) {
	var parseContentObject = function (template_name, locale, mime, func) {
		if(!view._render_target) view._render_target = { }; 
		if(!view._render_target[template_name]) view._render_target[template_name] = { };
		if(!view._render_target_mime) view._render_target_mime = { }; 
				
		view._render_target[template_name][locale] = func;
		view._render_target_mime[template_name] = mime || 'binary/octet-stream';
		view._isString = false;
		view._isTemplate = false;
		
		return true;
	};
	
	var default_template = options[DEFAULT_TEMPLATE],
		default_locale = options[DEFAULT_LOCALE];
	
	if(typeof options[CONTENT] === 'function') {
		default_template = default_template || 'default_2';
		default_locale = default_locale || 'en-us';
		
		if(typeof options[MIME] !== 'string') throw new Error('MIME is not set or not a string');
		
		if(isBackbone) {
			if(!parseContentObject(default_template, default_locale, options[MIME], options[CONTENT]))
				return;
			view._backbone_prevention = 'text/javascript';
			if(isBackbone === BACKBONE_MODEL) {
				var _backbone = BackboneGenerator.generateModelContentFunction(
						options[ACCEPT_URL], options[ACCEPT_METHOD], options[BACKBONE]);
				view._backbone_rmi = _backbone.accept_rmi;
				parseContentObject(BACKBONE, default_locale, 'text/javascript', _backbone.content_func);
			} else {
				var _backbone = BackboneGenerator.generateCollectionContentFunction(
					options[ACCEPT_URL], options[ACCEPT_METHOD], options[BACKBONE]);
				view._backbone_rmi = _backbone.accept_rmi;
				parseContentObject(BACKBONE, default_locale, 'text/javascript', _backbone.content_func);
			}
			
			view.on('text/javascript', function (request, response) { return response.OK().render(BACKBONE).commit(); });							
		} else {
			if(!parseContentObject(default_template, default_locale, options[MIME], options[CONTENT]))
				return;
		}
	} else if (typeof options[CONTENT] === 'object') {
		for(var content in options[CONTENT]) {
			if(typeof options[CONTENT][content] === 'function') {
				default_template = default_template || content;
				default_locale = default_locale || 'en-us';
		
				if(typeof options[MIME] !== 'object') throw new Error('MIME is not set or not an object');
				if(typeof options[MIME][content] !== 'string') throw new Error('MIME is not set or not a string for ' + content);
						
				if(!parseContentObject(content, default_locale, options[MIME][content], options[CONTENT][content]))
					return;
				break;
			}
			
			for(var locale in options[CONTENT][content]) {
				default_template = default_template || content;
				default_locale = default_locale || locale;
				 
				if(typeof options[MIME] !== 'object') throw new Error('MIME is not set or not an object');
				if(typeof options[MIME][content] !== 'object') throw new Error('MIME is not set or not an object for ' + content);
				if(typeof options[MIME][content][locale] !== 'string') throw new Error('MIME is not set or not a string for ' + locale);
				
				if(!parseTemplateObject(template, locale, options[MIME][content][locale], options[CONTENT][content][locale]))
					return;
			}
		}
	} else
		throw new Error('template must be one of : filename, object(locale: filename)');
	
	view._default_template = default_template;
	view._default_locale = default_locale;
	view._content_func = _content_func;
	view._mime_func = _mime_func;
	/*view.updateTemplate = _updateTemplate;*/
}

/*function _updateTemplate (obj) {
	if(!this._isString) return global.gozy.error('templates must be string');
	
	var template_languages = _.keys(this._render_target);
	
	for(var i=0; i<template_languages.length; i++)
		this._render_target[template_languages[i]] = _.template(this._render_target[template_languages[i]], obj); 
}*/

function _mime_func (template) {
	return this._render_target_mime[template || this._default_template];
}

function _content_func (template, locale_arr) {
	var template_name = template || this._default_template;
	locale_arr = locale_arr || [this._default_locale];
	
	global.gozy.silly('locating ' + template_name + ' through ' + locale_arr.toString());

	template = this._render_target[template_name];
	
	if(!template) {
		throw new Error('A template (name: "' + template_name + '") is not defined. Didn\'t you use STRING-typed parameter?');
	}
	
	for(var i=0; i<locale_arr.length; i++) { /* exact match */
		if(template[locale_arr[i]]) {
			global.gozy.silly('template found from exact match: ' + template_name + ' -> ' + locale_arr[i]);
			return template[locale_arr[i]];
		}
	}
	
	var template_languages = _.keys(template),
		template_language_map = { };
	for(var i=0; i<template_languages.length; i++) {
		template_language_map[template_languages[i].split('-')[0]] = template[template_languages[i]];
	}

	for(var i=0; i<locale_arr.length; i++) { /* language match */
		var locale = locale_arr[i].split('-')[0];
		
		if(template_language_map[locale]) {
			global.gozy.silly('template found from language match: ' + template_name + ' -> ' + locale);
			return template_language_map[locale];
		}
	}
	
	global.gozy.silly('template not found for ' + locale_arr.toString() + '.');
	
	if(!template[this._default_locale]) {
		throw new Error('template ' + template_name + ' is not defined for default locale ' + this._default_locale);
	}
	
	global.gozy.silly('default template served.');
	
	return template[this._default_locale];
}