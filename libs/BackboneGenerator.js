var cluster = require('cluster'),
	_ = require('underscore');

var GOZY_RMI = exports.GOZY_RMI = 'x-gozy-rmi';
var GOZY_DGT = exports.GOZY_DGT = 'x-gozy-dgt';

var /* GLOBAL CONSTANTS */
	TYPE = 'Type', BACKBONE_MODEL = 'model', BACKBONE_COLLECTION = 'collection',
	AcceptRMI = 'AcceptRMI',
	ACCEPT_URL = 'AcceptUrl',
	/* CONSTANTS FOR MODEL */
	MODEL_OPTIONS = 'ModelOptions',
	/* CONSTANTS FOR COLLECTION */ 
	MODEL_URL = 'ModelUrl', 
	COLLECTION_OPTIONS = 'CollectionOptions', PARSE_OVERRIDE = 'parse';
	
/* RMI TEMPLATE */
var RMITemplate = [
	'<% for(var i=0; i<AcceptRMI.length; i++) { ',
	'	var rmi_name = AcceptRMI[i]; %>',
	'<%=rmi_name%>: function () {',
	'	var params = [], cb;',
	'	if(arguments.length === 0) {',
	'		cb = function () { };',
	'	} else if(typeof arguments[arguments.length - 1] === \'function\') {',
	'		cb = arguments[arguments.length - 1];' 	,
	'		for(var i=0; i<arguments.length - 1; i++) { ',
	'			if(typeof arguments[i] !== \'function\')',
	'				params.push(arguments[i]);',
	'			else', 
	'				throw new Error(\'An argument for Gozy RMI Request cannot be a function: at \' + i);',
	'		}',
	'	} else {',
	'		cb = function () { };',
	'		for(var i=0; i<arguments.length; i++) {',
	'			if(typeof arguments[i] !== \'function\')',
	'				params.push(arguments[i]);',
	'			else', 
	'				throw new Error(\'An argument for Gozy RMI Request cannot be a function: at \' + i);',
	'		}',
	'	}',
	'',
	'	$.ajax({',
	'		url: \'<%=url%>\',',
	'		type: \'POST\',',
	'		async: true,',
	'		accept: \'application/json\',',
	'		contentType: \'application/json; charset=UTF-8\',',
	'		dataType: \'json\',',
	'		headers: { \'' + GOZY_RMI + '\': \'<%=rmi_name%>\', \'' + GOZY_DGT + '\': \'<%=method%>\' },',
	'		data: JSON.stringify(params),',
	'		complete: function (jqXHR, textStatus) {',
	'			if(jqXHR.status !== 200) throw new Error(\'Returned status from Gozy RMI Request is "\' + jqXHR.statusText + \'"\');', 
	'			cb.apply(cb, jqXHR.responseJSON);',
	'		},',
	'	});',
	'}',	    		
	'<% } %>'
].join('\n');

/* COLLECTION TEMPLATE */	 
var RequireJSCollectionPrefix = [
	'define([',
    '	\'jquery\',',
	'	\'underscore\',',
	'	\'backbone\'',
	'<% if(model_url) { %>',
	'	\'<%=model_url%>\'',
	'], function($, _, Backbone, Model) {',
	'<% } else { %>',
	'], function($, _, Backbone) {',
	'<% } %>',
].join('\n');

var BackboneCollectionTemplate = [
	'	var Model = Backbone.Model.extend({',
	'<% if(ModelOptions) { %>',
	'		<%=ModelOptions%>',
	'<% } %>',
  	'	});',
	'	var Collection = Backbone.Collection.extend({',
	'		url: \'<%=url%>\',',
	'		model: Model,',
	'		<%=CollectionOptions%>',
	'<% if(AcceptRMI && AcceptRMI.length > 0) { %>',
	'	,',
	RMITemplate,
	'<% } %>',
  	'	});'
].join('\n');

var RequireJSCollectionSuffix = [
	'',
	'	return Collection;',
	'});'
].join('\n');

/* MODEL TEMPLATE */
var RequireJSModelPrefix = [
	'define([',
    '	\'jquery\',',
	'	\'underscore\',',
	'	\'backbone\'',
	'], function($, _, Backbone) {',
	'',
].join('\n');

var BackboneModelTemplate = [
	'	var Model = Backbone.Model.extend({',
	'		url: \'<%=url%>\',',
	'		<%=ModelOptions%>',
  	'	});'
].join('\n');

var RequireJSModelSuffix = [
	'',
	'	return Model;',
	'});'
].join('\n');

exports.generateModelContentFunction = function (accept_url, accept_method, options) {
	if(options[TYPE] !== BACKBONE_MODEL) throw new Error('Integrity check failed: is not a model');
	
	if(accept_url instanceof RegExp) accept_url = regexp2string(accept_url);
	if(typeof options[ACCEPT_URL] == 'string') accept_url = options[ACCEPT_URL];
	
	if(cluster.isMaster) {
		global.gozy.silly('Backbone Model generation for ' + accept_method + ' ' + accept_url);
	}
	
	var ModelOptions = options[MODEL_OPTIONS];
	if(ModelOptions) {
		ModelOptions = JSON.stringify(options.ModelOptions);
		ModelOptions = ModelOptions.substring(1, ModelOptions.length - 1);
	} else ModelOptions = '';
	
	
	var GeneratedTemplate = _.template(BackboneModelTemplate, {
		url: accept_url,
		ModelOptions: ModelOptions
	});
	
	if(options.RequireJS) 
		GeneratedTemplate = RequireJSModelPrefix + GeneratedTemplate + RequireJSModelSuffix;
	
	if(cluster.isMaster) {
		global.gozy.silly('Backbone Model has been generated:\n' + GeneratedTemplate);
	}
	
	GeneratedTemplate = new Buffer(GeneratedTemplate);
	return {
		accept_rmi: [],
		content_func: function () {
			return GeneratedTemplate;
		}
	};
};

exports.generateCollectionContentFunction = function (accept_url, accept_method, options) {
	if(options[TYPE] !== BACKBONE_COLLECTION) throw new Error('Integrity check failed: is not a collection');
	 
	if(accept_url instanceof RegExp) accept_url = regexp2string(accept_url);
	if(typeof options[ACCEPT_URL] == 'string') accept_url = options[ACCEPT_URL];
	
	if(cluster.isMaster) {
		global.gozy.silly('Backbone Collection generation for ' + accept_method + ' ' + accept_url);
	}
	
	var CollectionOptions = options[COLLECTION_OPTIONS],
		accept_rmi = [];
	
	if(CollectionOptions) {
		if(CollectionOptions[AcceptRMI]) {
			accept_rmi = CollectionOptions[AcceptRMI];
			delete CollectionOptions[AcceptRMI];
		}
		
		var _parse_func_overrided; 
		if(CollectionOptions[PARSE_OVERRIDE]) {
			_parse_func_overrided = CollectionOptions[PARSE_OVERRIDE] + '';
			delete CollectionOptions[PARSE_OVERRIDE];
		}
		
		CollectionOptions = JSON.stringify(options.CollectionOptions);
		CollectionOptions = CollectionOptions.substring(1, CollectionOptions.length - 1);
		
		if(_parse_func_overrided) CollectionOptions += (CollectionOptions ? ', parse: ' : 'parse: ') + _parse_func_overrided;
	} else CollectionOptions = '';
	
	var ModelOptions = options[MODEL_OPTIONS];
	if(ModelOptions) {
		ModelOptions = JSON.stringify(options.ModelOptions);
		ModelOptions = ModelOptions.substring(1, ModelOptions.length - 1);
	} else ModelOptions = '';
	
	var GeneratedRequireJSCollectionPrefix = _.template(RequireJSCollectionPrefix, {
		model_url: options[MODEL_URL]
	});
	
	var GeneratedTemplated = _.template(BackboneCollectionTemplate, {
		url: accept_url,
		method: accept_method,
		ModelOptions: ModelOptions,
		CollectionOptions: CollectionOptions,
		AcceptRMI: accept_rmi
	});
	
	if(options.RequireJS) 
		GeneratedTemplated = GeneratedRequireJSCollectionPrefix + GeneratedTemplated + RequireJSCollectionSuffix;
		
	if(cluster.isMaster) {
		global.gozy.silly('Backbone Collection has been generated:\n' + GeneratedTemplated);
	}
	
	GeneratedTemplated = new Buffer(GeneratedTemplated);
	return {
		accept_rmi: accept_rmi,
		content_func: function () {
			return GeneratedTemplated;
		}
	};
};

function regexp2string(regex) {
	var string = regex.toString();
	string = string.replace(/\[[A-z0-9\-]*\]/g, '');
	string = string.replace(/{[A-z0-9,]*}/g, '');
	string = string.replace(/[^A-z0-9\/]/g, '').replace(/[\^\\]/g, '');
	if(string.charAt(0) == '/' && string.charAt(string.length - 1) == '/')
		string = string.substring(1, string.length - 1);
	return string;
}