"use strict";

var crypto = require('crypto');
var mailer = require('nodemailer');

var User = module.exports = function() {
	var self = this;
};

User.prototype.auth = function(username, password, callback) {
	var self = this;

	var conn = User.frex.getConnection(arguments);
	var engine = User.engine;
	var model = engine.database.model;
	var db = engine.database.db;
	var dbSettings = engine.database.settings;

	db.open(dbSettings.dbName)
		.collection(dbSettings.table)
		.model(model.schema)
		.where({
			email: username
		})
		.limit(1)
		.query(function(err, rows) {

			if (err) {
				callback(new User.frex.Error('There is problem happened to user database'));
				return;
			}

			// Failed to authorize
			if (rows.length == 0) {
				callback(null, false);
				return;
			}

			// Get the first one
			var row = rows[0];

			// Failed if password is incorrect
			if (row.password != crypto.createHmac('sha256', password).digest('hex')) {
				callback(null, false);
				return;
			}

			// Initializing session
			conn.req.session._id = row._id;
			conn.req.session.name = row.name;
			conn.req.session.email = row.email;

			callback(null, true);
		});
};

User.prototype.resetPasswordWithToken = function(id, token, password, callback) {
	var self = this;

	var conn = User.frex.getConnection(arguments);
	var engine = User.engine;

	if (!id || !token || !password) {
		callback(new User.frex.Error('Failed', engine.statuscode.SYSERR));
		return;
	}

	var model = engine.database.model;
	var db = engine.database.db;
	var dbSettings = engine.database.settings;

	// Update password and clear token
	db.open(dbSettings.dbName)
		.collection(dbSettings.table)
		.model(model.schema)
		.where({
			_id: id,
			token: token
		})
		.limit(1)
		.update({
			password: crypto.createHmac('sha256', password).digest('hex'),
			token: ''
		}, { return_new_data: true } ,function(err, rows) {

			if (err) {
				callback(new User.frex.Error('Failed', engine.statuscode.SYSERR));
				return;
			}

			// Incorrect token or username doesn't exists
			if (!rows) {
				callback(new User.frex.Error('Failed', engine.statuscode.INVALID));
				return;
			}

			callback(null);
		});
	
};

User.prototype.generateToken = function(username, callback) {
	var self = this;

	var conn = User.frex.getConnection(arguments);

	// Generate secure rendom token
	crypto.randomBytes(16, function(ex, buf) {
		var token = buf.toString('hex');

		var engine = User.engine;
		var model = engine.database.model;
		var db = engine.database.db;
		var dbSettings = engine.database.settings;

		// Saving token
		db.open(dbSettings.dbName)
			.collection(dbSettings.table)
			.model(model.schema)
			.where({
				email: username
			})
			.limit(1)
			.update({
				token: token
			}, { return_new_data: true } ,function(err, record) {

				if (err) {
					callback(new User.frex.Error('Failed', engine.statuscode.SYSERR));
					return;
				}

				if (!record) {
					callback(new User.frex.Error('Failed', engine.statuscode.NONEXIST));
					return;
				}

				// Sending token to specific e-mail
				var mailerConfig = engine.settings.mailer;
				var transport = mailer.createTransport("SMTP", {
					host: mailerConfig.host,
					port: mailerConfig.port,
					secureConnection: mailerConfig.ssl,
					auth: {
						user: mailerConfig.auth.user,
						pass: mailerConfig.auth.password
					}
				});

				var serviceHost = null;
				if (engine.settings.service.port == 80) {
					serviceHost = 'http://' + engine.settings.service.server_host;
				} else {
					serviceHost = 'http://' + engine.settings.service.server_host + ':' + engine.settings.service.port;
				}

				transport.sendMail({
					from: mailerConfig.from.name + ' <' + mailerConfig.from.address + '>',
					to: record.name + ' <' + record.email + '>',
					subject: 'You requested a new ' + engine.settings.service.service_name + ' password',
					html: '<p>You\'re receiving this e-mail because you requested a password reset for your user account at ' +
						engine.settings.service.service_name + '.</p>' +
						'<p>Please go to the following link and choose a new password:</p>' +
						'<p><a href=\'' + serviceHost + '/reset_password/' + record._id + '/' + token + '\'>' +
						serviceHost + '/reset_password/' + record._id + '/' + token + '</a></p>'
				});

				callback(null);
			});
	});
};

User.prototype.signOut = function(callback) {

	var conn = User.frex.getConnection(arguments);

	if (!conn.req.session)
		conn.req.session = {};

	conn.req.session._id = null;
	conn.req.session.name = null;
	conn.req.session.email = null;

	callback(null);
};

User.prototype.isLogin = function(callback) {

	var conn = User.frex.getConnection(arguments);

	try {
		if (conn.req.session.username) {

			callback(true);
			return;
		}

	} catch(e) {}

	callback(false);
};

User.prototype.getMyInfo = function(callback) {

	var conn = User.frex.getConnection(arguments);

	// Login is required
	if (!conn.req.session.username) {
		callback(new User.frex.Error('No permission to access'));
		return;
	}

	callback(null, {
		name: conn.req.session.name,
		email: conn.req.session.email
	});
};

User.prototype.getInfo = function(username, callback) {

	var conn = User.frex.getConnection(arguments);
 
	var engine = User.engine;
	var model = engine.database.model;
	var db = engine.database.db;
	var dbSettings = engine.database.settings;
	var validator = conn.req.validator;

	db.open(dbSettings.dbName)
		.collection(dbSettings.table)
		.model(model.schema)
		.where({
			email: username
		})
		.limit(1)
		.query(function(err, rows) {

			if (err) {
				callback(new User.frex.Error('There is problem happened to user database'));
				return;
			}

			// No such user
			if (rows.length == 0) {
				callback(new User.frex.Error('No such user'));
				return;
			}

			callback(null, {
				name: rows[0].name,
				email: rows[0].email,
				created: rows[0].created
			});

		});
};

User.prototype.signUp = function(info, callback) {
	var self = this;

	var conn = User.frex.getConnection(arguments);

	var engine = User.engine;
	var model = engine.database.model;
	var db = engine.database.db;
	var dbSettings = engine.database.settings;
	var validator = conn.req.validator;

	// Check display name
	validator.checkObject(info, 'displayname', {
		notEmpty: engine.statuscode.EMPTY
	}).notEmpty();

	// Check Email
	validator.checkObject(info, 'email', {
		isEmail: engine.statuscode.INVALID
	}).isEmail();

	// Check password
	validator.checkObject(info, 'password', {
		notEmpty: engine.statuscode.EMPTY
	}).notEmpty();

	var errors = validator.getObjectErrors();
	if (errors) {
		callback(new User.frex.Error('FieldError', errors));
		return;
	}

	// Check whether email exists
	db.open(dbSettings.dbName)
		.collection(dbSettings.table)
		.model(model.schema)
		.select({
			id: 1
		})
		.where({
			email: info.email
		})
		.limit(1)
		.query(function(err, rows) {

			if (err) {
				callback(new User.frex.Error('Failed', engine.statuscode.SYSERR));
				return;
			}

			if (rows.length) {
				callback(new User.frex.Error('Failed', engine.statuscode.EXISTS));
				return;
			}


			// Write to database
			db.open(dbSettings.dbName)
				.collection(dbSettings.table)
				.model(model.schema)
				.insert({
					name: info.displayname,
					email: info.email,
					password: crypto.createHmac('sha256', info.password).digest('hex'),
					created: new Date().getTime()
				}, function(err, row) {

					if (err) {
						callback(new User.frex.Error('Failed', engine.statuscode.SYSERR));
						return;
					}

					// Initializing session
					conn.req.session._id = row._id;
					conn.req.session.name = info.displayname;
					conn.req.session.email = info.email;

					// Send information back
					callback(null, {
						_id: row._id,
						name: info.displayname,
						email: info.email
					});
				});
		});
};
