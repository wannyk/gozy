"use strict";

var fs = require('fs'),
	path = require('path');

exports.requireAllJS = function (_path) {
	var fs_queue = [], file_count = 0;

	_path = path.resolve(_path);
	fs.readdirSync(_path).forEach(function (file_name) {
		fs_queue.push(_path + '/' + file_name);
	});
	
	while(fs_queue.length > 0) {
		var current_path = fs_queue.pop(),
			stat = fs.statSync(current_path);
		
		if(stat.isDirectory()) {
			fs.readdirSync(current_path).forEach(function (file_name) {
				fs_queue.push(current_path + '/' + file_name);
			});
		} else if(stat.isFile()) {
			var match = current_path.match(/^.*\/(.+)\.(.+)$/),
				name = match[1],
				ext = match[2] && match[2].toLowerCase();
			
			if(ext === 'js') {
				var obj = require(current_path);
				if(obj) {
					obj._filename = name;
					file_count++;
				}
			}
			
		}
	}
	
	return file_count;
};