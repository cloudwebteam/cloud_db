var _ = require( 'underscore' ); 
var noop = function(){}; // do nothing.

function TableSync( db, tableSpec, cb ){
	cb = cb || noop;

	this.db = db;
	this.spec = {
		name: '', 
		columns: {}, 
		constraints: {}
	}
	_.extend( this.spec, tableSpec );

	/* ==== prepare & check the format of the spec ============================================= */
	if ( !this.spec.name ){
		console.log( 'SYNC: table has no name' );
		return cb( false );
	}
	if ( this.spec.columns.length === 0 ){
		console.log( 'SYNC: table has no columns specified' );
		return cb( false );
	}
	var colsHaveDbTypes = true;
	this.spec.columns = _.map( this.spec.columns, function( colSpec, colName ){
		if ( ! colSpec.hasOwnProperty( 'db' ) ){
			colSpec.db = {};
		}		
		colSpec.db = _.extend({ 
			type: 'varchar(200)',
			'default': null,
			'null': true
		}, colSpec.db );

		if ( colSpec.hasOwnProperty( 'db_type' ) ){
			colSpec.db.type = colSpec.db_type;
			delete colSpec.db_type; 
		} else if ( ! colSpec.db.hasOwnProperty( 'type') ){
			console.log( 'SYNC: table has column \'' + colName + '\' without a database type specified. varchar(200) has been aded.')
		}
		colSpec.name = colName; 
		return colSpec;
	});
	this.spec.columns = _.toArray( this.spec.columns );
	var that = this;

	/* ==== API ============================================= */
	this.check = function( cb ){
		cb = cb || noop;

		var that =this;
		this.checkForTable( this.spec.name, function( tableExists ){
			// if the table doesn't exist, then stop everything and create it according to spec
			if ( ! tableExists ){
				return cb({
					table: false,
					columns: false,
					constraints: false
				})
			}			

			// get current columns data from DB
			var dbColumns = [];
			that.db.query( 'SHOW FIELDS FROM `' + that.spec.name + '`', function( results ){
				var dbColData = results;		
				// arrange columns from DB into agreeable format
				_.each( dbColData, function( dbColumn, index ){
					if( dbColumn.Field === 'ID' ) return;

					dbColumns.push({
						index: index,
						name: dbColumn.Field,
						type: dbColumn.Type,
						'null': dbColumn.Null,
						'default': dbColumn.Default
					});
				});

				// go through columns in spec and compare to DB
				var columnsToRemove = [];
				var columnsToAdd = [];
				var columnsToRename = [];					
				var columnsToChange = [];

				// check if there are extra columns in DB that are not in spec -
				columnsToRemove = _.filter( dbColumns, function( value ){
					return ! _.findWhere( that.spec.columns, { name : value.name });
				});

				_.each( that.spec.columns, function( colSpec ){
					var dbColumn = _.findWhere( dbColumns, { name: colSpec.name });
					
					// column doesn't exist
					if ( ! dbColumn ){			
						columnsToAdd.push( colSpec ); // change format to easily compare with toRemove array
						return;
					}		
					var updateNeeded = false;		

					_.each( colSpec.db, function( value, key ){
						if ( value !== dbColumn[key] ){
							// change in NULL is a little nuanced
							if ( key  === 'null' ){
								if ( value && dbColumn[key].toLowerCase() !== 'yes' ){
									updateNeeded = true;
								} else if( ! value && dbColumn[key].toLowerCase() !== 'no' ){
									updateNeeded = true;
								}
							// change in anything isn't, and a sync is required
							} else {
								if ( _.isNumber( value ) && value !== +dbColumn[key] ){
									updateNeeded = true;
								}
							}
						}						
					});
					if ( updateNeeded ){
						columnsToChange.push( colSpec.name );
					}

				});	
				// check for column renaming...
				if ( columnsToRemove.length > 0 && columnsToAdd.length > 0 ){
					columnsToRemove = _.map( columnsToRemove, function( dbColumn ){
						var index = dbColumns
						var colBefore = index - 1 > 0 ? dbColumns[ index -1 ].name : 'ID'; 
						var colAfter = dbColumns.length > ( index + 1 ) ? dbColumns[index+1].name : false;
						return {
							index: dbColumn.index,
							name: dbColumn.name,							
							type: dbColumn.type,
							before: colBefore,
							after: colAfter
						}
					}); 
					columnsToAdd = _.map( columnsToAdd, function( colSpec ){

						var colBefore = colSpec.index - 1 > 0 ? that.spec.columns[ colSpec.index -1 ].name : 'ID'; 
						var colAfter = that.spec.columns.length > ( colSpec.index + 1 ) ? that.spec.columns[ colSpec.index + 1 ].name : false;
						return {
							name: colSpec.name,							
							type: colSpec.db.type,
							before: colBefore,
							after: colAfter
						}
					});
					columnsToAdd = _.filter( columnsToAdd, function( colToAdd ){
						var renamed = false;
						columnsToRemove = _.filter( columnsToRemove, function( colToRemove ){
							if ( renamed ){
								return true;
							}
							if(
								colToAdd.after === colToRemove.after 
								&& colToAdd.before === colToRemove.before 
								&& colToAdd.type === colToRemove.type 
							){
								columnsToRename.push({
									from: colToRemove.name,
									to: colToAdd.name
								});
								renamed = true;
								return false; 
							}
							return true;
						});
						return ! renamed;
					});					
				}
				columnsToAdd = _.map( columnsToAdd, function( col ){
					return col.name; 
				});
				columnsToRemove = _.map( columnsToRemove, function( col ){
					return col.name; 
				});

				return cb({
					table: true,
					columns: {
						added: columnsToAdd,
						removed: columnsToRemove,
						renamed: columnsToRename,
						changed: columnsToChange,
					},
					constraints: false
				});

			} );
		});
	}
	this.sync = function( cb ){
		cb = cb || noop;

		var that = this;
		var colNames = _.pluck( this.spec.columns, 'name' );
		this.check( function( status ){

			// create missing table
			if ( ! status.table ){
				that.createTable( function(){
					// we assume that all columns are in sync, because we created it from the spec
				});
			} else {
				// CREATE added columns
				if ( status.columns.added.length > 0 ){
					_.each( status.columns.added, function( colName ){
						var colPosition = colNames.indexOf( colName ); 
						var afterWhichCol = colPosition === 0 ? 'ID' : colNames[ colPosition - 1 ];
						var colSpec = _.findWhere( that.spec.columns, { name: colName });
						var query = 'ALTER TABLE `' + that.spec.name + '`';
						query += ' ADD `' + colName + '` ' + colSpec.db.type; 
						query += ' AFTER `' + afterWhichCol + '`' ;
						
						db.query( query, function( result ){
							if ( result ){
								console.log( 'SYNC: Added column \'' + colName + '\' to table \'' + that.spec.name + '\'' );
							}
						});
					});
				}
				// DELETE removed columns ( if empty )
				if ( status.columns.removed.length > 0 ){
					_.each( status.columns.removed, function( colName ){
						// check if its empty
						var query = 'SELECT * FROM `' + that.spec.name + '`' ;
						query += " WHERE `" + colName + "` IS NOT NULL" ; 
						that.db.query( query, function( result ){
							if ( result.length > 0 ){
								console.log( 'SYNC: \'' + that.spec.name + '.' + colName + '\' is no longer needed, but was not deleted because it has data.')
								return false; 
							}

							query = 'ALTER TABLE `' + that.spec.name + '` DROP ' + colName; 
							that.db.query( query, function( result ){
								if ( result ){
									console.log( 'SYNC: Removed \'' + that.spec.name + '.' + colName + '\'' );
								}
							}); 

						});
					}); 

				}

				// RENAME renamed columns 
				if ( status.columns.renamed.length > 0 ){
					_.each( status.columns.renamed, function( renamedCol ){
						var colSpec = _.findWhere( that.spec.columns, { name: renamedCol.to });						
						var nullValue =  colSpec.db['null'] ? ' null' : ' not null';
						var defaultValue = colSpec.db['default'] ? ' DEFAULT ' + colSpec.db['default'] : '';

						var query = 'ALTER TABLE `' + that.spec.name + '`';
						query += ' CHANGE `' + renamedCol.from + '`';
						query += ' `' + renamedCol.to + '`';
						query += ' ' + colSpec.db.type;
						query += nullValue;
						query += defaultValue;	

						that.db.query( query, function( result ){
							if ( result ){
								console.log( 'Renamed column \'' + that.spec.name + '.' + renamedCol.from + '\' to \'' + that.spec.name + '.' + renamedCol.to + '\'' );
							}
						} );
					});			
				}				
				// CHANGED altered columns
				if ( status.columns.changed.length > 0 ){
					_.each( status.columns.changed, function( colName ){
						var colSpec = that.spec.columns[ colName ];
						var nullValue =  colSpec.db['null'] ? ' null' : ' not null';
						var defaultValue = colSpec.db['default'] ? ' DEFAULT ' + colSpec.db['default'] : '';

						var query = 'ALTER TABLE `' + that.spec.name + '`';
						query += ' MODIFY COLUMN `' + colName + '`';
						query += ' ' + colSpec.db.type;
						query += nullValue;
						query += defaultValue;	

						that.db.query( query, function( result ){
							if ( result ){
								console.log( 'Updated column \'' + that.spec.name + '.' + colName + '\' because it had changed.' );
							}
						} )
					});
						
				}				
				
			}
						
			cb( 'SYNCING...', status );
		});
	}
}
TableSync.prototype.checkForTable = function( tableName, next ){
	this.db.query( "SHOW TABLES LIKE '" + tableName + "'", function( result ){		
		var tableExists = result && result.length > 0; 
		next( tableExists ); 
	});	
}	
TableSync.prototype.createTable = function( cb ){
	console.log( 'created table' + this.spec.name + ' because it did not exist.');	
	this.db.query( getTableQuery( this.spec ), cb ); 
}
function getTableQuery( tableSpec ){		
	var query = '';
	query += "CREATE TABLE `" + tableSpec.name + '`';
	var unique = tableSpec.unique ? 'UNIQUE ' : ''; 
	
	var columns = [];
	_.each( tableSpec.columns, function( col_spec, col_name ){
		columns.push( unique + ' `' + col_spec.name + '` ' + col_spec.db.type );
	});

	query += ' ( ';
	query += 'ID int NOT NULL AUTO_INCREMENT PRIMARY KEY, '; 
	query += columns.join( ', ' );
	query += ' )';
	query += ' ENGINE=InnoDB';
	return query;

}
var tableSyncer = ( function(){

	var checkSyncStatus = function( connection, tableSpec, cb ){
		return new TableSync( connection, tableSpec ).check( cb );
	}
	var executeTableSync = function( connection, tableSpec, cb ){
		return new TableSync( connection, tableSpec ).sync( cb ); 
	}
	return {
		checkSync: checkSyncStatus,
		sync: executeTableSync
	}
}() ); 

module.exports = tableSyncer; 	