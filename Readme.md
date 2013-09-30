Cloud DB
=======

Setup
-------
#### 1. Configure connection

```js 
db.use({
	host: 'localhost', 
	user: 'devAdmin',
	password: 'theBestCloudPW',
	database: 'cloud_db'
});
```
*Uses [node-mysql](https://github.com/felixge/node-mysql) for its mysql connection, and accepts all the same options.*

#### 2. Add tables

Save the table spec in a different file, same file, wherever. Just gotta define it and add it.

```js 
var userTableSpec = { 
	name: 'string', // name of table in database
	columns: {object} // an array of columns, minus ID ( detailed [below](#table-array) )
};
db.addTable( userTableSpec ); // register the table
```
#### 3. Connect
```js
db.connect( function(){
	myTable = db.table('myTable');
	// all CRUD operations here.
});
```
#### 6. Sync
Cloud_DB provides two methods to make sure the table spec matches the existing table in the DB. 

```js
myTable.checkSync(); // returns a list of what it will create, rename, remove, or change
myTable.sync(); // returns that list, and executes any necessary changes
```

Syncing will: 
- see a new column in the spec and create it
- see an extra column in the DB and remove it (if it is empty, otherwise it will simply let you know).
- recognize a renamed column and rename it.
- alter changed properties such as default and null.
- future versions should support adding and removing indexes/foreign keys.

#### 5. CRUD
```js
var userTable = db.table( 'User' ); // get a table
userTable.get( 5, function( results ){ // call a CRUD function
	// results is row with ID 5 from the User table.
});
(note, can be chained).

// or...

db.get( 'User', 5, function( results ){
	// results is row with ID 5 from the User table.
});
```
*same as way 1, except table name is first argument, and all the other arguments are shifted to accordingly*



Basic crud operations
----------
All CRUD operations have been made as intuitive as possible.
- all possible uses are listed below. 
- check out the [examples](#examples) section for more specifics.


**Note: *all accept a callback function as the last argument* ** 
Its been left out for clarity

#### .create()

- `table.create( args )` // boom, added a DB entry.

* returns full row from database. *

#### .get()

- `.get()` // retrieve all rows in table (returns array of rows)
- `.get( getArgs )` // retrieve all entries that match the object (returns array of rows)
- `.getOne( getArgs )` // the first of all entries that match (returns single row)
- `.get( int )` // retrieve a single row by ID (returns single row)

#### .update()

- `.update( ID, updateArgs );` // update one row by ID with updateArgs
- `.update( updateArgs );` // as long as ID exists in the first argument, it uses the rest as update arguments
	- so...you could retrieve a DB row, change something, and pass it in here, and it would update.
	- boom.
- `.update( getArgs, updateArgs );` // update all db matching getArgs (no ID, obviously) with updateArgs

#### .delete()

- `.delete( ID )` // delete row by ID
- `.delete( getArgs )` // delete all rows that match the given parameters. 
	- If object has ID, then only that row is deleted, so you can pass in a row to delete it.

args object
-------
```js
{
	// KEYS: any column in the table spec, plus ID
	// VALUES: any value 
		// that the MySQL datatype for that row supports, 
		// that also passes the 'validate' and 'required' spec (if provided)
	id: {int},
	col_name: {int/str/bool}, // false and null evaluate to 'NULL' in the database,
	another_col_name: {int/str/bool},

	// specific to .get( getArgs ); 
	// all following can be either lower or uppercase, and are 
	SELECT: {str/array}, // which column(s) to select from the row,
	LIMIT: {int}, 
	OFFSET: {int},
	ORDER: {str},
	ORDERBY: {str},
	GROUPBY: {str}
}
```