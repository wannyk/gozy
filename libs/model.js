"use strict";

var cluster = require('cluster');
var utilities = require('./utilities'),
	_ = require('underscore'),
	async = require('async'),
	EventEmitter = require('events').EventEmitter;

var prototypes = {
	'Mongo': require('./model_prototypes/mongo'),
	'MySQL': require('./model_prototypes/mysql'),
	'Redis': require('./model_prototypes/redis')
};

var model_pool = {};
var db_pool = {};

exports.connectAll = function (cb) {
	var conn = [], 
		model_keys = _.keys(model_pool),
		db_keys = _.keys(db_pool);
	
	for(var i=0; i<model_keys.length; i++) {
		if(!db_pool[model_keys[i]]) {
			var unset = [];
			for(var j=0; j<model_pool[model_keys[i]].length; j++)
				unset.push(model_pool[model_keys[i]][j]._filename + '.js');
			return cb(new Error('Database "' + model_keys[i] + '" is not set for model ' + unset.join(',')));
		} 
	}
	
	for(var i=0; i<db_keys.length; i++) {
		if(!model_pool[db_keys[i]])
			if(cluster.isMaster) global.gozy.warn('Database "' + db_keys[i] + '" does not have any model');		
		
		conn.push(_.bind(db_pool[db_keys[i]].connect, db_pool[db_keys[i]]));
	}
	
	async.parallel(conn, function (err) {
		if(err) return cb(err);
			
		for(var i=0; i<db_keys.length; i++) {
			var key = db_keys[i];
			
			if(model_pool[key]) {
				for(var j=0; j<model_pool[key].length; j++)
					db_pool[key].attachModel(model_pool[key][j]);
			}
		}
		
		return cb(null);
	});
};

exports.Model = function (obj, dbname, opt) {
	/* Called by individual model scripts as 'require('gozy').Model~' */
	_.extend(obj, new EventEmitter());
	obj._opt = opt;
	
	if(!model_pool[dbname]) model_pool[dbname] = [];
	model_pool[dbname].push(obj);
};

exports.bind = function (model_path, obj) {
	/* In order to 'require' all model scripts within the path */
	var file_count = utilities.requireAllJS(model_path);

	if(cluster.isMaster) global.gozy.info(file_count + ' models found');
};

_.keys(prototypes).forEach(function (model_prototype) {
	exports['bind' + model_prototype] = function (dbname, options) {
		db_pool[dbname] = new (prototypes[model_prototype])(dbname, options);
		return this;
	};
});