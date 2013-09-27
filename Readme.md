Cloud DB
=======

Setup
-------
### Configure connection
*uses [node-mysql](https://github.com/felixge/node-mysql) for its mysql connection, and accepts all the same options.*

```js 
db.use({
	host: 'localhost', 
	user: 'devAdmin',
	password: 'theBestCloudPW',
	database: 'cloud_db'
});
```

### Add tables
```js 
var userTableSpec = { name: 'User' }; // name of table in DB

db.addTable( userTableSpec ); // register the table to be able to CRUD it
```
### Connect
```js
db.connect( function(){
	// on connection, do whatever
});
```

### CRUD
**Way 1**

```js
// get a table
var userTable = db.table( 'User' );

// call the appropriate function
userTable.get( 5, function( results ){
	// results is row with ID 5 from the User table.
});
```

**Way 2**

*same as above, except table name is first argument, and all the other arguments are shifted to accomodate*

```js
db.get( 'User', 5, function( results ){
	// results is row with ID 5 from the User table.
});
```

Basic crud operations
----------

### .create()

- .create( args )

### .get()

- `.get()` // all entries in table
- `.get( ID )` // single entry by ID
- `.get( args )` // all entries that match
- `.getOne( args )` // the first of all entries that match

### .update()

- `.update( ID, args );` // update one object with the arguments
- `.update( args );` // update one object with ID args.id
- `.update( getArgs, args );` // update the objects matching first args with second args

### .delete()

- `.delete( ID )` // just row with that id
- `.delete( args )` // all items that match. If object has ID, then that object is deleted

args object
-------
```js
{
	// a column name for key
	id: {int},
	col_name: {int/str/bool}, // false and null evaluate to 'NULL' in the database,
	another_col_name: {int/str/bool},
	// all following can be either lower or uppercase
	SELECT: {str/array}, // which column(s) to select from the row,
	LIMIT: {int}, 
	OFFSET: {int},
	ORDER: {str},
	ORDERBY: {str},
	GROUPBY: {str}
}
```