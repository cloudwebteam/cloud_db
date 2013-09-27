CRUD
====

Create functions
------------
.create( args )

Get functions
------------
.get() // all entries in table
.get( ID ) // single entry by ID
.get( args ) // all entries that match

.getOne( args ) // the first of all entries that match

Update functions
------------
.update( ID, args ); // update one object with the arguments
.update( args ); // update one object with ID args.id
.update( getArgs, args ); // update the objects matching first args with second args

Delete functions
------------
.delete( ID ) // just row with that id
.delete( args ) // all items that match. If object has ID, then that object is deleted
