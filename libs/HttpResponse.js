var util = require('util'),
	Renderer = require('./Renderer').Renderer;

var HTTP_STATUS = exports.HTTP_STATUS = [
		{"code": 200, "name": "OK", "headers_required": [], "function_required": [''] },
		{"code": 201, "name": "Created", "headers_required": [], "function_required": [''] },
		{"code": 202, "name": "Accepted", "headers_required": [], "function_required": [''] },
		{"code": 204, "name": "No Content", "headers_required": [], "function_required": [''] },
		{"code": 205, "name": "Reset Content", "headers_required": [], "function_required": [''] },
		{"code": 301, "name": "Moved Permanently", "headers_required": ['Location'], "function_required": [''] },
		{"code": 302, "name": "Found", "headers_required": ['Location'], "function_required": ['_302Settings'] },
		{"code": 303, "name": "See Other", "headers_required": ['Location'], "function_required": [''] },
		{"code": 304, "name": "Not Modified", "headers_required": ['Etag', 'Last-Modified'], "function_required": [''] },
		{"code": 305, "name": "Use Proxy", "headers_required": ['Location'], "function_required": [''] },
		{"code": 307, "name": "Temporary Redirect", "headers_required": ['Location'], "function_required": [''] },
		{"code": 400, "name": "Bad Request", "headers_required": [], "function_required": [''] },
		{"code": 401, "name": "Unauthorized", "headers_required": ['WWW-Authenticate'], "function_required": [''] },
		{"code": 403, "name": "Forbidden", "headers_required": [''], "function_required": [''] },
		{"code": 404, "name": "Not Found", "headers_required": [''], "function_required": [''] },
		{"code": 405, "name": "Method Not Allowed", "headers_required": ['Allow'], "function_required": [''] },
		{"code": 406, "name": "Not Acceptable", "headers_required": [], "function_required": [''] },
		{"code": 407, "name": "Proxy Authentication Required", "headers_required": [''], "function_required": [''] },
		{"code": 408, "name": "Request Time Out", "headers_required": [''], "function_required": [''] },
		{"code": 409, "name": "Conflict", "headers_required": [], "function_required": [''] },
		{"code": 410, "name": "Gone", "headers_required": [], "function_required": [''] },
		{"code": 411, "name": "Length Required", "headers_required": [], "function_required": [''] },
		{"code": 413, "name": "Request Entity Too Large", "headers_required": [], "function_required": ['closeConnection'] },
		{"code": 415, "name": "Unsupported Media Type", "headers_required": [], "function_required": [''] },
		{"code": 500, "name": "Internal Server Error", "headers_required": [], "function_required": [''] },
		{"code": 501, "name": "Not Implemented", "headers_required": [], "function_required": [''] },
		{"code": 502, "name": "Bad Gateway", "headers_required": [], "function_required": [''] },
		{"code": 503, "name": "Service Unavailable", "headers_required": [], "function_required": [''] },
		{"code": 504, "name": "Gateway Time Out", "headers_required": [], "function_required": [''] },
		{"code": 505, "name": "HTTP Version not supported", "headers_required": [], "function_required": [''] },
];

var ISBACKBONE = '_backbone_';

var print_response = false;

exports.printResponse = function (print) {
	print_response = print;
	return this;
};

function HttpResponse(res, cb) {
	this._response = res;
	this._status = null;
	this._headers = [];
	this._body = null;
	this._content_type = null;
	this._committed = false;
	cb(this);
}

util.inherits(HttpResponse, Renderer);

HTTP_STATUS.forEach(generateHttpResponse);

function generateHttpResponse(status) {
	var code = status.code;
		name = status.name.replace(/\s/g, '');
	
	HttpResponse.prototype[name] = function () {
		this._status = code;
	
		for(var i=0; i<status.headers_required.length; i++)
			if(arguments[i]) this.appendHeader(status.headers_required[i], arguments[i]);	
		for(var i=0; i<status.function_required.length; i++)
			if(this[status.function_required[i]]) this[status.function_required[i]]();
		
		return this;
	};
}
//------------------------------------- APPLICATION FUNCTION

HttpResponse.prototype.setStatus = function (status) {
	this._status = status;
	return this;
};

HttpResponse.prototype.setBackboneResponse = function (isBackboneRequest) {
	this[ISBACKBONE] = isBackboneRequest;
	return this;
};

HttpResponse.prototype.setLocale = function (locale) {
	if(typeof locale === 'string') this._response_locale = [ locale ];
	else this._response_locale = locale;
	return this;
};

HttpResponse.prototype.closeConnection = function () {
	this._headers.push(['Connection', 'close']);
	return this;
};

HttpResponse.prototype.contentType = function (contentType) {
	if(contentType.split(';').length === 1) this._content_type = contentType + '; charset=UTF-8';
	else this._content_type = contentType; 
	return this;
};

HttpResponse.prototype.contentDisposition = function (contentDisposition) {
	this._content_disposition = contentDisposition;
	return this;
};

HttpResponse.prototype.cacheFor = function (etag, last_modified) {
	if(etag) this.appendHeader('Etag', etag);
	if(last_modified) this.appendHeader('Last-Modified', last_modified);
	return this;
};

HttpResponse.prototype.noStoreCache = function () {
	this.appendHeader('Cache-Control', 'no-store');
	this.appendHeader('Pragma', 'no-cache');
	return this;
};

HttpResponse.prototype.json = function(json) {
	this._body = new Buffer(JSON.stringify(json), 'utf8');
	return this.contentType('application/json; charset=UTF-8');
};

HttpResponse.prototype.text = function(text) {
	this._body = new Buffer(text, 'utf8');
	return this.contentType('text/plain; charset=UTF-8');
};

HttpResponse.prototype.addCookie = function (name, value, expires, http_only, secure, domain, path) {
	var cookie = undefined;
	
	if(typeof name === 'object') {
		cookie = [name.name + '=' + name.value];
		if(name.expires != undefined) cookie.push('Expires=' + name.expires);
		if(name.http_only) cookie.push('HttpOnly');
		if(name.secure) cookie.push('Secure');
		if(name.domain != undefined) cookie.push('Domain=' + name.domain);
		if(name.path != undefined) cookie.push('Path=' + name.path);
	} else {
		cookie = [name + '=' + value];
		if(expires != undefined) cookie.push('Expires=' + expires);
		if(http_only) cookie.push('HttpOnly');
		if(secure) cookie.push('Secure');
		if(domain != undefined) cookie.push('Domain=' + domain);
		if(path != undefined) cookie.push('Path=' + path);	
	}
	
	return this.appendHeader('Set-Cookie', cookie.join(';'));
};

HttpResponse.prototype.error = function (err) {
	this.InternalServerError();
	global && global.gozy && global.gozy.error && global.gozy.error(err);
	return this.commit();
};

//------------------------------------- RAW FUNCTION

HttpResponse.prototype.commit = function () {
	if(this._committed) return;
	
	if(this._content_type) this.appendHeader("Content-Type", this._content_type);
	else this.appendHeader("Content-Type", "text/plain; charset=UTF-8");
	
	if(this._content_disposition) this.appendHeader("Content-Disposition", this._content_disposition);	
	
	if(this._body) this.appendHeader("Content-Length", this._body.length);
	else this.appendHeader("Content-Length", 0);
	
	if(!this._status) {
		global.gozy.error('Response status is not set. Response as 500');
		this._status = 500;
	}
	
	this._response.writeHead(this._status, this._headers);
	if(this._body) this._response.write(this._body);
	this._response.end();
	
	if(print_response) global.gozy.debug('printing response...\n----------- RESPONSE BEGIN -----------\n' + this.toString() + '------------ RESPONSE END ------------');
	this._committed = true;
	return this;
};

HttpResponse.prototype.appendHeader = function (name, value) {
	this._headers.push([name, value]);
	return this;
};

HttpResponse.prototype.body = function(body) {
	if(Buffer.isBuffer(body)) this._body = body;
	else this._body = new Buffer(body);
	return this;
};

//------------------------------------- UTILITIES

HttpResponse.prototype.toString = function () {
	return '[HTTP_RESPONSE_OBJECT]';
	var str = [];
	str.push('HTTP/1.1 ' + this._status + ' ' + stringifyStatus(this._status));
	for(var i=0; i<this._headers.length; i++)
		str.push(this._headers[i][0] + ': ' + this._headers[i][1]);
	str.push('');
	/*if(this._body) 
		str.push(this._body);*/
	return str.join('\n');
};

HttpResponse.prototype._302Settings = function () {
	var _url;
	for(var i=0; i<this._headers.length; i++) {
		if(this._headers[i][0] == 'Location') {
			_url = this._headers[i][1];
			break;
		} 
	}
	_url = _url || '/';

	this.contentType('text/html; charset=UTF-8');	
	this.body('<p>Found. Redirecting to <a href="' + _url + '">' + _url + '</a></p>');
	/*this.contentType('text/plain');	
	this.body('Found. Redirecting to ' + _url);*/
};

function stringifyStatus(code) {
	for(var i=0; i<HTTP_STATUS.length; i++)
		if(code === HTTP_STATUS[i].code)
			return HTTP_STATUS[i].name;
}

exports.HttpResponse = HttpResponse;