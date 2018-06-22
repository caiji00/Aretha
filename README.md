# IoT-refine
Refine for the smart home

* db
* (pyshark -> db)
* (db -> bursts -> NN -> db)
* (front end)
* init

## Db

Written for Postgres

Nice things:
* When looking for packets to bin into bursts, can just look for packets where (burst == NULL)
* Ditto for bursts to categories

## Testing

Create a postgres db with name testdb, user is postgres and password is password (or else change in `databaseBursts.py`)

Run `testDB.py` to populate with packet data from `AlexaTest1`

Run `testCategorisation.py` to run categorisation scripts on this data

Expected result is 8 bursts, 3 of which are Time and the rest are Unknown. 
Output should be similar to [(1, 1), (2, 2), (3, 2), (4, 2), (5, 1), (6, 2), (7, 2), (8, 1)]