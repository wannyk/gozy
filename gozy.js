"use strict";

var cluster = require('cluster'),
	http = require('http'),
	_ = require('underscore'),
	logger = require('./libs/logger'),
	model = require('./libs/model'),
	view = require('./libs/view'),
	mailer = require('./libs/mailer'),
	renderer = require('./libs/renderer'),
	HttpRequest = require('./libs/HttpRequest'),
	HttpResponse = require('./libs/HttpResponse');

function Gozy() {
	this._logger = logger.defaultLogger();
	this._websocket = false;
	this._workers = require('os').cpus().length; 
}

Gozy.prototype.logLevel = function (level) {
	this._logger = logger.defaultLogger(level);
	return this;
};

Gozy.prototype.bindModels = function (path) {
	model.bind(path, this);
	return this;
};

Gozy.prototype.bindViews = function (path) {
	view.bind(path, this);
	return this;
};

Gozy.prototype.bindResources = function (path, bind_url, debug) {
	renderer.bindResources(path, bind_url, debug);
	return this;
};

Gozy.prototype.setNumberOfWorkers = function (num) {
	this._workers = num;
	return this;
};


Gozy.prototype.listen = function (port) {
	prep.call(this, _.bind(function (err) {
		if(err) global.gozy.error(err);
		if (cluster.isMaster) {
			for (var i = 0; i < this._workers; i++)
				cluster.fork();
			
			cluster.on('exit', function(worker, code, signal) {
				console.log('worker ' + worker.process.pid + ' died');
			});
		} else {
			http.createServer(this.onRequest).listen(port);
			global.gozy.info('Gozy(pid: ' + process.pid + ') is opened on port ' + port);
		}
		
		
	}, this));
};

Gozy.prototype.onRequest = function (request, response) {
	new (HttpRequest.HttpRequest)(request, function (http_req) {
		new (HttpResponse.HttpResponse)(response, function (http_res) {
			if(renderer.interceptResourceRequest(http_req, http_res)) return;
			
			http_res.setLocale(http_req.locale());
			
			view.control(http_req, http_res);	
		});			
	});	
};

Gozy.prototype.enableWebSocket = function () {
	this._websocket = true;
	return this;
};

Gozy.prototype.Model = model.Model;
Gozy.prototype.View = view.View;
Gozy.prototype.Mailer = mailer.Mailer;

Gozy.prototype.bindMongo = model.bindMongo;
Gozy.prototype.bindRedis = model.bindRedis;
Gozy.prototype.bindMySQL = model.bindMySQL;

Gozy.prototype.bindMailer = mailer.bindMailer;

function prep(cb) {
	model.connectAll(function (err, res) {
		if(err) return cb(err);
		
		mailer.initializeAll();
		//view.prepareView();
		
		return cb(null);
	});
}

module.exports = new Gozy();