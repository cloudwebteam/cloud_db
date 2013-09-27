var mysql = require( 'mysql' );
var _ = require( 'underscore' );
var Table = require( './Table');
function CloudDb(){
	this._lastQuery = false;
	this._lastQueryArgs = false;
	this._connectionInfo = {}; 
	this._connection = false;
	this._tables = {};
}
CloudDb.prototype.addTable = function( tableSpec ){
	this._tables[ tableSpec.name ] = new Table( this, tableSpec ); 
	return this;
}; 
CloudDb.prototype.addTables = function( tables ){
	var that = this;
	_.each( tables, function( tableSpec ){
		this.addTable( tableSpec );
	});
	return this;
}; 
CloudDb.prototype.table = function( tableName ){
	if ( _.has( this._tables, tableName )){
		return this._tables[ tableName ];
	}
	console.log( 'Table "' + tableName+ '" has not been registered' )
	return false;
}
/* ==== CONNECTION FUNCTIONS ============================================= */
CloudDb.prototype.use = function( connection_info ){
	this._connectionInfo = connection_info; 	
	return this;
};
CloudDb.prototype.connect = function( connection_info, callback ){
	var that = this;

	if ( typeof(connection_info) === 'object' ){
		this.use( connection_info );
	} else if ( typeof(connection_info ) === 'function' ){
		callback = connection_info;
	}
	if ( this._connection ){
		this._connection.end();
	}
	// new connection
	this._connection = mysql.createConnection( this._connectionInfo );
	this._connection.connect( function(){
		callback( that ); 
	});
	return this; 
}
CloudDb.prototype.end = function(){
	this._connection.end();
}

/* ==== QUERY FUNCTIONS ============================================= */
CloudDb.prototype.query = function( query, callback ){
	this._lastQuery = query;

	this._connection.query( query, function( err, rows ){
		if( err ){
			console.log( err ); 
		}
		callback( rows ); 
	}); 
}

/* ==== CRUD ============================================= */

CloudDb.prototype.create = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.create.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.get = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.get.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.getOne = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.getOne.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.update = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.update.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.delete = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.delete.apply( table, Array.prototype.slice.call(arguments, 1) );
}


module.exports = new CloudDb;