"use strict";

var _ = require('underscore'),
	winston = require('winston'),
	util = require('util');

var levels = {'silly': 0, 'verbose': 1, 'info': 2, 'warn': 3, 'debug': 4,  'error': 5, 'uncaught': 6},
	colors = {'silly': 'white', 'verbose': 'white', 'info': 'grey', 'warn': 'yellow', 'debug': 'green',  'error': 'red', 'uncaught': 'red'},
	defaultLevel = 'verbose',
	uncaughtLevel = 'uncaught';

function Logger(logger) {
	this._logger = logger;
	
	_.keys(levels).forEach(_.bind(function (level) { 
		this[level] = _.bind(function (msg, meta) {
			if(msg instanceof Error) msg = '[STACK BELOW]\n' + msg.stack;
			if(msg instanceof Object) msg = '[OBJECT BELOW]\n' + util.inspect(msg);
			this._logger[level](new Date().toISOString() + (msg ? ': ' + msg : '') + (meta ?'\n': ''), meta);
		}, this); 
	}, this));
	
	this.attachUncaughtHandler();
	this.attachGlobal();
}

Logger.prototype.attachUncaughtHandler = function (handler) {
	if(!handler) handler = _.bind(function (err) {
		this[uncaughtLevel](err);
	}, this);

	process.removeAllListeners('uncaughtException');
	process.on('uncaughtException', handler);
};

Logger.prototype.attachGlobal = function () {
	if(!global.gozy) global.gozy = {};
	
	_.keys(levels).forEach(_.bind(function (level) { 
		global.gozy[level] = this[level]; 
	}, this));
};

exports.defaultLogger = function (logLevel) {
	var _logger = new (winston.Logger)({
		levels: levels,
		colors: colors
	});
	
	_logger.add(winston.transports.Console, {
		level: logLevel || defaultLevel,
		colorize: 'true'
	});
	
	return new Logger(_logger);
};