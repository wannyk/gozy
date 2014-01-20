"use strict";

var url = require('url'),
	qs = require('querystring'),
	fs = require('fs'),
	formidable = require('formidable');

var print_request = false;
var BACKBONE = 'backbone', BACKBONE_MODEL = 'model', BACKBONE_COLLECTION = 'collection',
	AUTHORIZATION = 'authorization', 
	ACCEPT = 'accept',
	ACCEPT_LANGUAGE = 'accept-language',
	USER_AGENT = 'user-agent',
	CONTENT_LENGTH = 'content-length',
	CONTENT_TYPE = 'content-type',
	IF_NONE_MATCH = 'if-none-match',
	IF_MODIFIED_SINCE = 'if-modified-since',
	X_REQUESTED_WITH = 'x-requested-with',
	REFERER = 'referer';

exports.printRequest = function (print) {
	print_request = print;
	return this;
};

function HttpRequest(req, cb) {
	this._httpVersion = req.httpVersion;
	this._headers = req.headers;
	this._url = url.parse(req.url);
	if(this._url.query) this._url.query = qs.parse(this._url.query);
	this._method = req.method;
	this._cookie = parseCookie(this._headers['cookie']);
	
	if(print_request) global.gozy.debug('printing request...\n----------- REQUEST BEGIN -----------\n' + this.toString() + '------------ REQUEST END ------------');
	
	if((this._method === 'POST' || this._method === 'PUT' || this._method === 'PATCH') && this._headers['content-type'])
		return parseBody(req, this, cb);
	else
		return cb(this);
}

function parseBody(req, http_req, cb) {
	var content_type = http_req._headers[CONTENT_TYPE].split(';')[0];
	
	switch(content_type) {
	case 'multipart/form-data':
		new formidable.IncomingForm().parse(req, function(err, fields, files) {
			var _body = {};
			for(var key in fields)
				_body[key] = fields[key];
			for(var key in files) {
				_body[key] = files[key];
				delete _body[key]['hash'];
				delete _body[key]['lastModifiedDate'];
				delete _body[key]['length'];
				delete _body[key]['filename'];
				delete _body[key]['mime'];
				_body[key]['load'] = function () {
					return fs.readFileSync(_body[key]['path']);
				};
			}
			
			http_req._body = _body;
			return cb(http_req);
		});
		break;
	case 'application/x-www-form-urlencoded':
		var charset = getCharset(http_req._headers[CONTENT_TYPE]);
		if(!charset) charset='utf8';
		
		var body = [], buf_size = 0;
		req.on('data', function(chunk) {
			body.push(chunk);
			buf_size += chunk.length;
		});

		req.on('end', function() {
			var buf = new Buffer(buf_size);
			for(var i=0, len=body.length, pos=0; i<len; i++) {
				body[i].copy(buf, pos);
				pos += body[i].length;
			}
			
			try {
				var _body = qs.parse(body.toString(charset));
				for(var key in _body) {
				if(typeof _body[key] === 'string')
					try {
						_body[key] = decodeURIComponent(_body[key]);
					} catch (e) {
						global.gozy.warn(e);
						if(_body[key]) delete _body[key];
					}
				}
				http_req._body = _body;
				return cb(http_req);
			} catch (err) {
				global.gozy.error(err.stack);
				return cb(http_req);
			}
		});	
		break;
	case 'application/json':
		var charset = getCharset(http_req._headers[CONTENT_TYPE]);
		if(!charset) charset='utf8';
		
		var body = [], buf_size = 0;
		req.on('data', function(chunk) {
			body.push(chunk);
			buf_size += chunk.length;
		});

		req.on('end', function() {
			var buf = new Buffer(buf_size);
			for(var i=0, len=body.length, pos=0; i<len; i++) {
				body[i].copy(buf, pos);
				pos += body[i].length;
			}
			
			try {
				var _body = JSON.parse(buf.toString(charset));
				http_req._body = _body;
				return cb(http_req);
			} catch (err) {
				global.gozy.error(err.stack);
				return cb(http_req);
			}
		});	
		break;
	default:
		global.gozy.warning('unknown content-type: ' + content_type);
		return cb(http_req);
	}
}

HttpRequest.prototype.body = function (item, func) {
	if(!this._body) return undefined;
	else if(item && func)
		return func(this._body[item]);
	else if(item)
		return this._body[item];
	else
		return this._body; 
};

HttpRequest.prototype.cookie = function (key) {
	if(key)
		return this._cookie[key];
	else
		return this._cookie; 
};

HttpRequest.prototype.header = function (key) {
	if(key)
		return this._headers[key];
	else
		return this._headers;
};

HttpRequest.prototype.authorization = function () {
	var authorization = this._headers[AUTHORIZATION];
	var obj = {};
	if(authorization) {
		authorization = authorization.split(' ');
		if(authorization.length == 2)
			obj[authorization[0]] = authorization[1];
		else if(authorization.length == 1)
			obj[authorization[0]] = '';
		else
			obj[authorization[0]] = '';
		return obj;
	} else
		return null;
};

HttpRequest.prototype.accept = function () {
	var accept = this._headers[ACCEPT], ordered_accept = [];
	if(!accept) return ['*/*'];
	accept = accept.split(',');
	try {
		for(var i=0; i<accept.length; i++) {
			accept[i] = accept[i].split(';');
			if(accept[i].length === 1) accept[i].push(1);
			else accept[i][1] = parseFloat(accept[i][1].split('=')[1]);
		}
		
		for(var i=0; i<accept.length-1; i++) {
			for(var j=i; j<accept.length; j++) {
				if(accept[i][1] < accept[j][1]) {
					var tmp = accept[i];
					accept[i] = accept[j];
					accept[j] = tmp;
				}
			}
		}
		
		for(var i=0; i<accept.length; i++)
			ordered_accept.push(accept[i][0].trim());
	} catch(e) {
		return null;
	}
	
	return ordered_accept;
};

HttpRequest.prototype.setLocale = function (locale) {
	this._headers[ACCEPT_LANGUAGE] = locale + ';q=1';
	return this;
};

HttpRequest.prototype.locale = function () {
	var locale = this._headers[ACCEPT_LANGUAGE], ordered_locale = [];
	if(!locale) return ['en-us', '*'];
	locale = locale.split(',');
	try {
		for(var i=0; i<locale.length; i++) {
			locale[i] = locale[i].split(';');
			if(locale[i].length === 1) locale[i].push(1);
			else locale[i][1] = parseFloat(locale[i][1].split('=')[1]);
		}
		
		for(var i=0; i<locale.length-1; i++) {
			for(var j=i; j<locale.length; j++) {
				if(locale[i][1] < locale[j][1]) {
					var tmp = locale[i];
					locale[i] = locale[j];
					locale[j] = tmp;
				}
			}
		}
		
		for(var i=0; i<locale.length; i++)
			ordered_locale.push(locale[i][0].toLowerCase());
	} catch(e) {
		return null;
	}
	
	return ordered_locale;
};

HttpRequest.prototype.isXHR = function () {
	return this._headers[X_REQUESTED_WITH] === 'XMLHttpRequest';
};

HttpRequest.prototype.isXHROriginatedFrom = function (origin) {
	if(this.isXHR()) {
		if(!this._headers[REFERER]) return false;
		var _referer = url.parse(this._headers[REFERER]);
		return _referer.host === origin;
	}
	return false; 
};

HttpRequest.prototype.pathname = function (pathno) {
	if(pathno) {
		var paths = this._url.pathname.split('/');
		return paths[pathno + 1];
	}
	return this._url.pathname; 
};

HttpRequest.prototype.query = function (name, func) {
	if(!this._url.query) return undefined;
	else if(name && func)
		return func(this._url.query[name]);
	else if(name)
		return this._url.query[name];
	else
		return this._url.query;
};

HttpRequest.prototype.method = function () {
	return this._method; 
};

HttpRequest.prototype.contentLength = function () {
	return parseInt(this._headers[CONTENT_LENGTH]);
};

HttpRequest.prototype.contentType = function () {
	return this._headers[CONTENT_TYPE];
};

HttpRequest.prototype.userAgent = function () {
	return this._headers[USER_AGENT];
};

HttpRequest.prototype.isModified = function (etag, last_modified) {
	var _etag = this._headers[IF_NONE_MATCH];
	var _last_modified = this._headers[IF_MODIFIED_SINCE];
	
	if(!_etag && !_last_modified) 
		return true;
	if(!etag && !last_modified)
		return true;
	
	if(etag) {
		if(!_etag || _etag !== etag)
			return true;
	}
	if(last_modified) {
		if(!_last_modified || new Date(_last_modified).getTime() < new Date(last_modified).getTime())
			return true;
	}
	
	return false;
};

HttpRequest.prototype.isBackboneRequest = function () {
	return (this.query(BACKBONE) === BACKBONE_MODEL ? BACKBONE_MODEL : this.query(BACKBONE) === BACKBONE_COLLECTION ? BACKBONE_COLLECTION : null); 
};

HttpRequest.prototype._rewriteRequest = function (_method, _url) {
	this._method = _method;
	this._url = url.parse(_url);
	return this;
};

HttpRequest.prototype.toString = function () {
	var str = [];
	str.push('[HTTP REQUEST OBJECT]');
	str.push('--- REQUEST BEGIN ---');
	str.push(this._method + ' ' + url.format(this._url) + ' HTTP/' + this._httpVersion);
	for(var key in this._headers)
		str.push(key + ': ' + this._headers[key]);
	str.push('');
	if(this._body)
		str.push(JSON.stringify(this._body));
	str.push('---- REQUEST END ----');
	return str.join('\n');
};

function parseCookie(cookie_str) {
	if(!cookie_str) return {};
	
	var cookie = {}, 
		str = [], 
		key = undefined;
	
	for(var pos=0; pos < cookie_str.length; pos++) {
		switch(cookie_str.charAt(pos)) {
		case ';':
			if(key) {
				cookie[key] = str.join('').trim();
				str = [];
				key = undefined;
			}
			break;
		case '=':
			if(!key) {
				key = str.join('').trim();
				str = [];
				break;
			}
		default: 
			str.push(cookie_str.charAt(pos)); 
			break;
		}
	}
	
	cookie[key] = str.join('').trim();
	
	return cookie;
}

function getCharset (str) {
	var charset = str.split(';')[1];
	if(!charset) return '';
	charset = charset.split('=');
	if(!charset || charset.length !== 2) return '';
	
	switch(charset[1].toLowerCase()) {
	case 'utf-8': return 'utf8';
	default: return null;
	}
}

exports.HttpRequest = HttpRequest;