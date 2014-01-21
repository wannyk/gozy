"use strict";

var cluster = require('cluster');
var _ = require('underscore'),
	fs = require('fs'),
	mime = require('mime'),
	crypto = require('crypto');
var view = require('./view');

var resource_path, resource_url, debug_mode;
var resources;

function Renderer () { };

exports.Renderer = Renderer;

Renderer.prototype.render = function (name, args) {
	if(!this._target_view) throw new Error('target view is not set');
	
	if(typeof name === 'object' && !args) {
		args = name;
		name = null;
	}
	
	var target_view = this._target_view;
	
	if(!target_view._content_func || !target_view._mime_func) {
		this.error('template ' + (name ? '"' + name + '" ' : '') + 'is not defined in ' + target_view._filename);
		return this;
	}
	
	var mime = target_view._mime_func(name),
		content = target_view._content_func(name, this._response_locale);
		
	if(target_view._isTemplate && target_view._isString) {
		if(args) {
			try {
				content = new Buffer(_.template(content, args), 'utf8');
			} catch(e) {
				this.error('templating error in ' + name + ': ' + e.toString());
				return this;
			}
		} else 
			content = new Buffer(content, 'utf8');
	} else if(target_view._isTemplate == false) {
		content = content(args);
		if(mime === 'application/json' && typeof content === 'object') content = new Buffer(JSON.stringify(content));
	}
	
	return this.body(content).contentType(mime);
};

exports.interceptResourceRequest = function (request, response) {
	if(!resources) return false;
	
	var path = request.pathname(),
		method = request.method(),
		accept = request.accept();
		
	if(!path || !method || !accept || method !== 'GET') 
		return false;
	
	for(var i=0; i<resource_url.length; i++) {
		if(i >= path.length) return false; 
		if(resource_url[i] !== path[i]) return false;
	}
	
	if(debug_mode) {
		path = resource_path + path.substring(resource_url.length, path.length);
		var item = readFile(path, true);
		if(!item) return response.NotFound().commit();
		
		response.OK()
		        .body(item.content)
		        .contentType(item.content_type)
		        .commit();
		return true;
	}
	
	var item = resources[path];
	if(item) {
		var item_accept = item.content_type.split('/');
		
		for(var i=0; i<accept.length; i++) {
			var _accept = accept[i].split('/');
			_accept[0] = _accept[0] && _accept[0].trim();
			_accept[1] = _accept[1] && _accept[1].trim();

			if((_accept[0] === '*' || item_accept[0] === _accept[0]) &&
					(_accept[1] === '*' || item_accept[1] === _accept[1])) {
				if(request.isModified(item.etag, item.last_modified)) {
					response.OK()
							.body(item.content)
							.contentType(item.content_type)
							.cacheFor(item.etag, item.last_modified)
							.commit();
				} else
					response.NotModified(item.etag, item.last_modified).commit();
				return true;
			}
		}
	}
	
	return false;
};

exports.bindResources = function (resourcepath, bindurl, debug) {
	var fs_queue = [], file_count = 0, byte_count = 0;
	resource_path = resourcepath;
	resource_url = bindurl;
	resources = {};
	
	if(debug === true) {
		if(cluster.isMaster) global.gozy.info('Static resources will not be cached since debug mode is enabled');
		debug_mode = true;
		return this;
	}
	
	fs.readdirSync(resource_path).forEach(function (file_name) {
		fs_queue.push(resource_path + '/' + file_name);
	});
	
	while(fs_queue.length > 0) {
		var path = fs_queue.pop();
		var stat = fs.statSync(path);
		
		if(stat.isDirectory()) {
			fs.readdirSync(path).forEach(function (file_name) {
				fs_queue.push(path + '/' + file_name);
			});
		} else if(stat.isFile()) {
			var name = path.substring(resource_path.length, path.length);
			
			var file = readFile(path);
			if(!file) continue;

			resources[resource_url + name] = file;
			
			byte_count += file.content.length;
			file_count++;
		}
	}
	
	if(cluster.isMaster) global.gozy.info(file_count + ' static resources (' +  parseInt(byte_count / 1024) + ' kB) cached');
	return this;
};

function readFile(path, disableHash) {
	var exist = fs.existsSync(path);
	if(!exist) return null;
	var stat = stat = fs.statSync(path);
	if(!stat.isFile()) return null;
	var buf = fs.readFileSync(path)
	
	return {
		'content': buf,
		'etag': disableHash === true ? null : getHash(buf),
		'last_modified': stat.mtime.toUTCString(),
		'content_type': mime.lookup(path)
	};	
}

function getHash(buf) {
	var sha1 = crypto.createHash('sha1');
	sha1.update(buf);
	return sha1.digest('base64');
}