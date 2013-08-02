"use strict";

var _ = require('underscore');

function MySQL(name, options) {
	this.name = name;
	this.host = options.host || 'localhost';
	this.port = options.port || 3306;
	this.database = options.database || 'test';
	this.username = options.username;
	this.password = options.password;
}

MySQL.prototype.connect = function (cb) {
	if(this.host && this.port && this.username && this.password && this.database) {
		global.gozy.info('Connecting to MySQL "' + this.name + '"(' + this.host + ':' + this.port + ' ' + (this.password ? 'with password)' : 'without password)'));
		
		this.mysql = require('mysql').createConnection({ 
			host: this.host, 
			port: this.port, 
			user: this.username, 
			password: this.password, 
			database: this.database 
		});
		
		this.mysql.connect(_.bind(function(err) {
  			if(err) return global.gozy.error(err);
  			
  			global.gozy.info('Successfully connected to ' + this.name);
  			cb && cb();
  		}, this));
	} else {
		global.gozy.error('MySQL connection failed');
		if(cb) cb();
	}
};

MySQL.prototype.attachModel = function (model) {
	var collection_name = model._filename,
		schema = model._opt && model._opt.schema;
	if(!schema) return global.gozy.warn('Model for MySQL, "' + model._filename + '", does not have schema definition');
	
	var primary_key = getPrimaryKey(schema);
	var SELECT_ALL = generate_SELECT_ALL(schema);
	
	var enums = explicitEnumerations(schema); 
	if(enums) model.ENUM = enums;
	
	model[collection_name] = generate_model(collection_name, schema);
	
	model.findById = this.generate_findById(SELECT_ALL, primary_key, collection_name, model[collection_name]);
	model.find = this.generate_find(SELECT_ALL, collection_name, model[collection_name], schema);
	model.findAll = this.generate_findall(SELECT_ALL, collection_name, model[collection_name], schema);
	model.count = this.generate_count(collection_name, schema);
	
	model.rawQuery = this.rawQuery();
	
	model[collection_name].prototype.save = this.generate_save(primary_key, collection_name, model, schema);
	model[collection_name].prototype.del = this.generate_del(collection_name, primary_key);
	
	model.emit('initialize', model[collection_name]);
};

function explicitEnumerations(def) {
	var enums = {};
	for(var key in def) {
		if(def[key].type === 'ENUM') {
			enums[key.toUpperCase()] = {};
			for(var i=0; i<def[key].enum.length; i++)
				enums[key.toUpperCase()][def[key].enum[i].toUpperCase()] = def[key].enum[i]; 
		}
	}
	return enums;
}

function generate_SELECT_ALL(def) {
	var st = [];
	for(var key in def) {
		switch(def[key].type) {
		case 'BINARY': st.push('HEX(`' + key + '`) AS `' + key + '`'); break;
		default: st.push('`' + key + '`'); break;
		}
	}
	return st.join(',');
}

function generate_UPDATE_SET(def, primary_key) {
	var st = [];
	for(var key in def) {
		if(key !== primary_key) {
			switch(def[key].type) {
			case 'BINARY': st.push('`' + key + '`=UNHEX(?)'); break;
			default: st.push('`' + key + '`=?'); break;
			}
		}
	}
	return st.join(',');
}

function getPrimaryKey(def) {
	for(var key in def) {
		if(def[key].Id)
			return key;
	}
	return undefined;
}

function generate_model (name, def) {	
	return function (obj) {
		if(!obj) obj = {};
		for(var key in def) {
			if(obj[key] !== undefined && obj[key] !== null) {
				switch(def[key].type) {
				case 'BINARY': this[key] = new Buffer(obj[key], 'hex'); break;
				case 'TIMESTAMP': this[key] = new Date(obj[key]); break;
				case 'OBJECT': this[key] = JSON.parse(obj[key]); break;
				case 'INTEGER': this[key] = parseInt(obj[key]); break;
				case 'FLOAT': this[key] = parseFloat(obj[key]); break;
				case 'ENUM':
				case 'STRING': this[key] = obj[key]; break;
				default: global.__igc__.warning('Unknown data type ' + def[key].type + ' in ' + name); break;
				}
			} else
				this[key] = undefined;
		}
	};
}

MySQL.prototype.generate_findById = function (SELECT_ALL, primary_key, name, model) {
	var me = this;
	
	return function (Id, cb) {
		me.mysql.query('SELECT ' + SELECT_ALL + ' FROM `' + name + '` WHERE `' + primary_key + '` = ?', [Id], function (err, res) {
			if(err || res.length === 0)
				return cb(err, null);
			cb(null, new model(res[0]));
		});
	};
};

MySQL.prototype.generate_findall = function (SELECT_ALL, name, model, def) {
	var me = this;
	
	return function (cb) {
		var Query = 'SELECT ' + SELECT_ALL + ' FROM `' + name + '`',
			val = [];

		me.mysql.query(Query, val, function (err, res) {
			var ret_arr = [];
			if(err || !res)
				return cb(err, null);
			res.forEach(function (item) {
				ret_arr.push(new model(item));
			});
			cb(null, ret_arr);
		});
	};
};

MySQL.prototype.generate_find = function (SELECT_ALL, name, model, def) {
	var me = this;
	
	return function (Query, cb) {
		var val;
		if(typeof Query === 'function') {
			
		} else if(typeof Query === 'string') {
			val = cb;
			opt = arguments[2];
			cb = arguments[3];
			Query = 'SELECT ' + SELECT_ALL + ' FROM `' + name + '` WHERE ' + Query + (opt?' '+opt:'');	
		} else {
			var query_str = [];
			val = [];
			for(var key in Query) {
				switch(def[key].type) {
				case 'BINARY':
					query_str.push('`' + key + '`=UNHEX(?)');
					if(Query[key]) val.push(Query[key].toString('hex'));
					else val.push(undefined);
					break;
				default:
					query_str.push('`' + key + '`=?');
					val.push(Query[key]);
					break;
				}
			}
			
			query_str = query_str.join(' AND ');
			Query = 'SELECT ' + SELECT_ALL + ' FROM `' + name + '` WHERE ' + query_str;
		}

		me.mysql.query(Query, val, function (err, res) {
			var ret_arr = [];
			if(err || !res)
				return cb(err, null);
			res.forEach(function (item) {
				ret_arr.push(new model(item));
			});
			cb(null, ret_arr);
		});
	};
};

MySQL.prototype.generate_count = function (name, def) {
	var me = this;
	
	return function (Query, cb) {
		var val;
		
		if(typeof Query === 'string') {
			val = cb;
			cb = arguments[2];
			Query = 'SELECT COUNT(*) AS CNT FROM `' + name + '` WHERE ' + Query;	
		} else {
			var query_str = [];
			val = [];
			for(var key in Query) {
				switch(def[key].type) {
				case 'BINARY':
					query_str.push('`' + key + '`=UNHEX(?)');
					if(Query[key]) val.push(Query[key].toString('hex'));
					else val.push(undefined);
					break;
				default:
					query_str.push('`' + key + '`=?');
					val.push(Query[key]);
					break;
				}
			}
			query_str = query_str.join(' AND ');
			Query = 'SELECT COUNT(*) AS CNT FROM `' + name + '` WHERE ' + query_str;
		}
		me.mysql.query(Query, val, function (err, res) {
			if(err || res.length === 0) return cb(err, null);
			cb(null, res[0].CNT);
		});
	};
};

MySQL.prototype.generate_save = function (primary_key, name, model_ext, def) {
	var me = this;
	
	return function (cb) {
		var val_arr = [], INSERT_INTO = [], INSERT_VALUES = [], UPDATE_SET = [];
		
		for(var key in def) {
			if(key !== primary_key && this[key] !== undefined) {
				switch(def[key].type) {
				case 'BINARY': 
					val_arr.push(this[key].toString('hex'));
					INSERT_VALUES.push('UNHEX(?)');
					UPDATE_SET.push('`' + key + '`=UNHEX(?)');
					break;
				case 'TIMESTAMP':
					val_arr.push(getMySQLTime(this[key]));
					INSERT_VALUES.push('?');
					UPDATE_SET.push('`' + key + '`=?');
					break;
				default: 
					val_arr.push(this[key]);
					INSERT_VALUES.push('?');
					UPDATE_SET.push('`' + key + '`=?');
					break;
				}
				
				INSERT_INTO.push('`' + key + '`');
			}
		}
		if(!this[primary_key]) {
			me.mysql.query('INSERT INTO `' + name + '` (' + INSERT_INTO + ') ' +  
								'VALUES	(' + INSERT_VALUES + ')', val_arr, function (err, res) {
				if(err) return cb(err);
				model_ext.findById(res.insertId, cb);
			});
		} else {
			var id = this[primary_key];
			val_arr.push(id);
			
			UPDATE_SET = UPDATE_SET.join(',');
			me.mysql.query('UPDATE `' + name + '` SET ' + UPDATE_SET + ' WHERE `' + primary_key + '`=?', val_arr, function (err, res) {
				if(err) return cb(err);
				model_ext.findById(id, cb);
			});
		}	
	};
};

MySQL.prototype.generate_del = function (name, primary_key) {
	var me = this;
	
	return function (cb) {		
		if(this[primary_key]) {
			me.mysql.query('DELETE FROM `' + name + '` WHERE `' + primary_key + '` = ?', [this[primary_key]], function (err, res) {
				if(err) return cb(err);
				return cb(null);
			});
		}	
	};
};

MySQL.prototype.rawQuery = function () {
	var me = this;
	
	return function (cb) {		
		if(this[primary_key]) {
			me.mysql.query('DELETE FROM `' + name + '` WHERE `' + primary_key + '` = ?', [this[primary_key]], function (err, res) {
				if(err) return cb(err);
				return cb(null);
			});
		}	
	};
};

function getMySQLTime(date) {
	return [date.getFullYear(),'-',date.getMonth()+1 > 9 ? date.getMonth()+1 : '0' + (date.getMonth()+1),'-',date.getDate(),' ',date.toLocaleTimeString()].join('');
}

module.exports = MySQL