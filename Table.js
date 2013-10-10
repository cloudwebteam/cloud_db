var _ = require( 'underscore' );
var validator = require( './validator' );
var TableSync = require( './TableSync' );
var noop = function(){}; // do nothing.
var Table = function( db, tableSpec ){
	this._db = db; 
	this._log = [];
	this._validator = validator; 
	this.logging = true;

	_.extend( this.spec, tableSpec );
	this.name = this.spec.name;
	if ( ! this.name ){
		this.log( 'You must, at a minumum, provide a table name' );
	}
}
Table.prototype.spec = {
	name: '',
	views: {
		detail: true,
		list: true,
		add: true,
		edit: true,
	},	
	columns: {},
	indexes: {},
	constraints: {},	
}
Table.prototype.getColumns = function( columnsToReturn ){
	if ( _.isArray( columnsToReturn ) && columnsToReturn.length > 0 ){
		var filtered = [];
		for( var i = 0; i < columnsToReturn.length; i++ ){
			filtered[ columnsToReturn[i] ] = this.spec.columns[ columnsToReturn[i] ] ;
		}

		return this._formatColumnSpecs( filtered ) ; 
	} else {
		return this._formatColumnSpecs( this.spec.columns );
	}
}	
Table.prototype._formatColumnSpecs = function( columnsSpec ){
	return _.toArray( _.map( columnsSpec, function( colSpec, colName ){
		if ( ! colSpec.hasOwnProperty( 'db' ) ){
			colSpec.db = {};
		}		
		colSpec.db = _.extend({ 
			type: 'varchar(200)',
			'default': null,
			'null': true,
			unique: false,
			foreign: false
		}, colSpec.db );

		if ( colSpec.hasOwnProperty( 'db_type' ) ){
			colSpec.db.type = colSpec.db_type;
			delete colSpec.db_type; 
		}
		colSpec.name = colName; 
		return colSpec;
	})); 	

}	
/* ==== QUERY and query sanitization ============================================= */
Table.prototype.query = function( query, next ){
	return this._db.query( query, next );
}
Table.prototype._prepareArgs = function( args ){
	if ( _.isNumber( args )){
		return args;
	}
	var toUpperCase = [ 'select', 'limit', 'offset', 'order', 'orderby', 'groupby' ]
	var results = {}
	for( key in args ){
		if ( toUpperCase.indexOf( key ) !== -1 ){
			results[ key.toUpperCase() ] =  args[key];
		} else {
			results[ key ] = args[key]; 
		}		
	}
	return results;
}
Table.prototype.validate = function( toSave ){
	var validation = this._validator.checkAgainstTable( toSave, this.getColumns() );
	
	if ( validation.passed ){
		return validation.toSave ; 
	} else {
		this.log( validation.errors ); 
		return false;
	}
}
Table.prototype.sync = function( cb ){
	var syncSpec = {
		name: this.spec.name, 
		columns: this.getColumns(),
		indexes: this.spec.indexes,		
		constraints: this.spec.constraints
	}
	TableSync.sync( this._db, syncSpec, cb );
}	
Table.prototype.checkSync = function( cb  ){
	var syncSpec = {
		name: this.spec.name, 
		columns: this.getColumns(),
		indexes: this.spec.indexes,
		constraints: this.spec.constraints
	}	
	TableSync.checkSync( this._db, syncSpec, cb ); 
}	
Table.prototype.addValidationType = function( type, validationFnct, defaultError ){
	this._validator.addType( type, validationFnct, defaultError );
}
Table.prototype.onSaveValidationType = function( validationType, fnct  ){
	this._validator.validator.onSave( validationType, fnct );
}

/* ==== CREATE ============================================= */
Table.prototype.create = function( args, next ){
	if ( ! args ){
		this.log( 'You must provide an object to '+ this.name + '.create()' ); 
		return;
	}
	next = next || noop;

	args = this.validate( args );
	if ( ! args ){
		this.log( 'The values did not pass the validation requirements, so nothing was created', 'Notice' )
		return; 
	}

	var col_names = [];
	var col_values = []; 
	_.each( args, function( col_value, col_name ){
		col_names.push( '`' + col_name + '`' ); 
		if ( col_value !== 0 && ! col_value ){
		 	col_values.push( 'NULL' );
		} else {
			col_values.push( '\'' + col_value  + '\'' ); 
		}		
	});
	var query =  'INSERT INTO `'+ this.name + '` ';
	
	query += '(' + col_names.join( ', ' ) + ') '; 		
	query += 'VALUES ';
	query += '(' + col_values.join( ', ' ) + ')';
	var that = this;
	this._db.query( query, function( result ){
		if( result ){
			that.get( result.insertId, function( dbObject ){
				next( dbObject );
			});
		} else { 
			that.log( 'Failed to insert row. Check MySQL error (probably related to foreign keys or unique indexes.)');
			next( false ); 
		} 
	}); 
}

/* ==== GET ============================================= */
Table.prototype.get = function( args, next ){	
	if ( ! args ){
		args = {}; 
	} else if ( _.isFunction( args ) ){
		next = args;
		args = {};
	} else if ( _.isArray( args )){
		// array of IDs for args
		args = { 
			ID: args
		}
	}
	next = next || noop;

	args = this._prepareArgs( args );	
	var query = this._getQuerySelect( args );
	query += this._getQueryWhere( args ); 
	query += this._getQueryOrder( args ); 
	this.query( query, function( results ){
		if ( ! results ){
			next( false );
			return;
		}
		if ( _.isNumber( args ) ){
			if ( results.length > 0 ){
				next( results[0] );
				return;
			}
		}
		next( results );
	}); 
	
}
Table.prototype.getOne = function( args, next ){	
	if ( ! args ) args = {}; 	
	if ( _.isFunction( args ) ){
		next = args; 
		args = {};
	}

	next = next || noop;

	args.LIMIT = 1; 
	this.get( args, function( results ){
		if ( results.length > 0 ){
			next( results[0] );
			return;
		}
		next( false );
	});
}
/* ---- query builder functions -------------------------------------- */
Table.prototype._getQuerySelect = function( args ){
	var query_select = '*';
	if ( args.hasOwnProperty( 'select' )){
		if ( _.isArray( args.select ) ){
			query_select = args.select.join( ', ' );
		} else {
			query_select = args.select;
		}
	}

	if ( query_select ){
		return 'SELECT ' + query_select + ' FROM `' + this.name + '`' + "\r\n"; 
	}
	return '';
};
Table.prototype._getQueryWhere = function( args ){
	var query_where = ''; 
	// its an ID that's been passed in		
	if ( _.isNumber( args ) ) {
		query_where += ' WHERE ID = ' + args;
		return query_where;
	}
	var select_terms = [];
	_.each( args, function( col_value, col_name ){
		var select_term = ''; 
		switch( col_name ){
			// ignore these guys
			case 'SELECT' :
			case 'LIMIT' : 
			case 'OFFSET' : 
			case 'ORDER' : 
			case 'ORDERBY' : 
			case 'GROUPBY' : 
				return;
				break;
			default:
				if ( _.isArray( col_value ) ){
					select_term = '`' + col_name  + '` IN ( \'' + col_value.join('\', \'') +'\' )';			
				} else if ( _.isObject( col_value ) ){
					// the only business an object has being here is to request...
					//... a subquery!
					var table = false;
					if ( this.constraints.hasOwnProperty( 'foreign key' ) && this.constraints[ 'foreign key' ].hasOwnProperty( col_name ) ){
						table = this.constraints['foreign key'][ col_name ].table ; 
						if ( ! table ){
							this.log().note( 'You have a sub query that does not specify a table', 'notice' );
							return;
						}

						select_term = '`' + col_name  + '` IN ( SELECT ID FROM `' + table + '`' + this._getQueryWhere( col_value ) + ' )'; 
					}
				} else if ( col_value || col_value === 0 ) {
					select_term = '`' + col_name + '` = "' + col_value + '"'; 
				// if set to empty string, false, or null
				} else {
					select_term = '`' + col_name + '` = "' + col_value + '" OR `' + col_name + '` IS NULL' ;
				}
		}
		select_terms.push( select_term ); 

	});
	if ( select_terms.length > 0 ){
		query_where += ' WHERE ';
		query_where += select_terms.join( ' AND ' );
	}
	if ( query_where ){
		return query_where  + "\r\n"; 
	}
	return '';
	
}
Table.prototype._getQueryOrder = function( args ){
	var query_order = '' ; 
	if ( _.isObject( args ) ){
		var groupby = args.hasOwnProperty( 'GROUPBY' ) ? args.GROUPBY : '';
		if ( groupby ){			
			query_order += ' GROUP BY `' + groupby  + '`'; 
		}		
		var orderby = args.hasOwnProperty( 'ORDERBY' ) ? args.ORDERBY : '';
		var order = args.hasOwnProperty( 'ORDER' ) ? args.ORDER : '';
		if ( orderby || order ){
			query_order += ' ORDER BY `' + orderby + '` ' + order;
		}		
		var limit = args.hasOwnProperty( 'LIMIT' ) ? args.LIMIT : '';
		if ( limit ){
			query_order += ' LIMIT ' + limit;
		} 

		var offset = args.hasOwnProperty( 'OFFSET' ) ? args.OFFSET : '';
		if ( offset ){
			query_order += ' OFFSET ' + offset;
		}	
		
	}
	if ( query_order ){
		return query_order  + "\r\n"; 
	}
	return '';
};

/* ==== UPDATE ============================================= */
Table.prototype.update = function( args1, args2, next ){
	if ( _.isNumber( args1 ) ){
		var whereArgs = args1;
		var updateArgs = args2; 
		if ( ! _.isObject( updateArgs ) || _.isEmpty( updateArgs ) ){
			this.log( 'Provided an id, but no args to ' +this.name + '.update()', 'notice' );
			return;
		}
	} else if ( _.isObject( args1 ) ){
		// use args1 as setter
		if ( _.has( args1, 'id' )){
			var object = args1;
			var id = args1.id; 
			delete args1.id;
			var whereArgs = id;
			var updateArgs = object; 
			if ( _.isEmpty( updateArgs )){
				this.log( this.name + '.update() needs an object with more than just id to execute an update.');
				return;
			}
			// shift callback to second argument
			var next = args2; 
		// use args1 to get all rows that match, and then use args2 to update the rows.
		} else {
			if ( ! _.isObject( args2 ) || _.isEmpty( args2 )){
				this.log( this.name + '.update() should have an object with properties to set as the second argument.' );
				return;
			}
			var whereArgs = args1; 
			var updateArgs = args2; 
		}
	} else {
		this.log( 'Please check the arguments provided for ' + this.name + '.update()', 'notice' );
		return;
	}

	next = next || noop;
	
	updateArgs = this.validate( updateArgs );
	if ( ! updateArgs ){
		this.log( 'The values did not pass the validation requirements, and weren\'t saved', 'Notice' )
		return; 
	}
	var select_terms = []; 
	_.each( updateArgs, function( col_value, col_name ){
		if( _.isString( col_value) ){
			col_value = '\'' + col_value + '\'';
		} else if ( _.isNull( col_value ) ){
			col_value = 'NULL';
		}
		select_terms.push( '`' + col_name  + '` = ' + col_value );
	});

	var query = 'UPDATE `' + this.name + '` SET '+ "\r\n";
	query += select_terms.join( ', ' ) + ' ' + "\r\n";
	query += this._getQueryWhere( whereArgs );
	var that = this;
	this.query( query, function( results ){
		if ( ! results ){
			this.log( this.name + '.update() failed for some reason' );
			next( false ); 
			return;
		} else if ( results.affectedRows ){
			that.get( whereArgs, function( updatedObject ){
				next( updatedObject );
			});
		}
	});
};
Table.prototype.delete  = function( to_delete, next ){
	if ( ! to_delete ){
		this.log( this.name + '.delete() needs an object or an id specified' );
		return;
	}

	next = next || noop;

	// DbObject given.
	if ( _.isObject( to_delete ) ){
		if ( to_delete.hasOwnProperty( 'id') ){
			var whereArgs = to_delete.id;
		} else {
			var whereArgs = to_delete;
		}

	// ID given
	} else {
		var whereArgs = to_delete;
	}
	var query = 'DELETE FROM ' + this.name + "\r\n";			
	query += this._getQueryWhere( whereArgs );
	this.query( query, function( results ){
		if ( results.affectedRows ){
			next( true );
		}
		next( false );
	});
}


/* ==== HANDLING errors ============================================= */
Table.prototype.log = function( message, type ){
	if ( this.logging ){
		if ( type ) message = type.toUpperCase() + ': '+ message;
		console.log( message );
	}
	this._log.push( message );
}
module.exports = Table; 