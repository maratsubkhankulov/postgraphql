-- We don’t have a `begin`/`commit` in here to let the users of this query
-- control the data lifecycle.

drop schema if exists a, b, c cascade;

create schema a;
create schema b;
create schema c;

comment on schema a is 'The a schema.';
comment on schema b is 'qwerty';

create domain b.email as text
  check (value ~* '^.+@.+\..+$');

create table c.person (
  id serial primary key,
  name varchar not null,
  about text,
  email b.email not null unique,
  created_at timestamp default current_timestamp
);

comment on table c.person is 'Person test comment';
comment on column c.person.name is 'The person’s name';

create table a.post (
  id serial primary key,
  headline text not null,
  body text,
  author_id int4 references c.person(id)
);

create type a.letter as enum ('a', 'b', 'c', 'd');
create type b.color as enum ('red', 'green', 'blue');

create type c.compound_type as (
  a int,
  b text,
  c b.color,
  d uuid,
  foo_bar int
);

create type b.nested_compound_type as (
  a c.compound_type,
  b c.compound_type,
  baz_buz int
);

comment on type c.compound_type is 'Awesome feature!';

create view b.updatable_view as
  select
    id as x,
    name,
    about as description,
    2 as constant
  from
    c.person;

comment on view b.updatable_view is 'YOYOYO!!';
comment on column b.updatable_view.constant is 'This is constantly 2';

create view a.non_updatable_view as select 2;

create table c.compound_key (
  person_id_2 int references c.person(id),
  person_id_1 int references c.person(id),
  extra boolean,
  primary key (person_id_1, person_id_2)
);

create table a.foreign_key (
  person_id int references c.person(id),
  compound_key_1 int,
  compound_key_2 int,
  foreign key (compound_key_1, compound_key_2) references c.compound_key(person_id_1, person_id_2)
);

create domain a.an_int as integer;
create domain b.another_int as a.an_int;

create table b.types (
  id serial primary key,
  "bigint" bigint,
  "boolean" boolean,
  "varchar" varchar,
  "enum" b.color,
  "domain" a.an_int,
  "domain2" b.another_int,
  "compound_type" c.compound_type,
  "nested_compound_type" b.nested_compound_type
);

create function a.add_1_mutation(int, int) returns int as $$ select $1 + $2 $$ language sql volatile strict;
create function a.add_2_mutation(a int, b int default 2) returns int as $$ select $1 + $2 $$ language sql strict;
create function a.add_3_mutation(a int, int) returns int as $$ select $1 + $2 $$ language sql volatile;
create function a.add_4_mutation(int, b int default 2) returns int as $$ select $1 + $2 $$ language sql;
create function a.add_1_query(int, int) returns int as $$ select $1 + $2 $$ language sql immutable strict;
create function a.add_2_query(a int, b int default 2) returns int as $$ select $1 + $2 $$ language sql stable strict;
create function a.add_3_query(a int, int) returns int as $$ select $1 + $2 $$ language sql immutable;
create function a.add_4_query(int, b int default 2) returns int as $$ select $1 + $2 $$ language sql stable;

comment on function a.add_1_mutation(int, int) is 'lol, add some stuff 1 mutation';
comment on function a.add_2_mutation(int, int) is 'lol, add some stuff 2 mutation';
comment on function a.add_3_mutation(int, int) is 'lol, add some stuff 3 mutation';
comment on function a.add_4_mutation(int, int) is 'lol, add some stuff 4 mutation';
comment on function a.add_1_query(int, int) is 'lol, add some stuff 1 query';
comment on function a.add_2_query(int, int) is 'lol, add some stuff 2 query';
comment on function a.add_3_query(int, int) is 'lol, add some stuff 3 query';
comment on function a.add_4_query(int, int) is 'lol, add some stuff 4 query';

create function b.mult_1(int, int) returns int as $$ select $1 * $2 $$ language sql;
create function b.mult_2(int, int) returns int as $$ select $1 * $2 $$ language sql called on null input;
create function b.mult_3(int, int) returns int as $$ select $1 * $2 $$ language sql returns null on null input;
create function b.mult_4(int, int) returns int as $$ select $1 * $2 $$ language sql strict;

create function c.types_query(a bigint, b boolean, c varchar) returns boolean as $$ select false $$ language sql stable;
create function c.types_mutation(a bigint, b boolean, c varchar) returns boolean as $$ select false $$ language sql;
create function c.compound_type_query(object c.compound_type) returns c.compound_type as $$ select (object.a + 1, object.b, object.c, object.d, object.foo_bar)::c.compound_type $$ language sql stable;
create function c.compound_type_mutation(object c.compound_type) returns c.compound_type as $$ select (object.a + 1, object.b, object.c, object.d, object.foo_bar)::c.compound_type $$ language sql;
create function c.table_query(id int) returns a.post as $$ select * from a.post where id = id $$ language sql stable;
create function c.table_mutation(id int) returns a.post as $$ select * from a.post where id = id $$ language sql;
create function c.table_set_query() returns setof c.person as $$ select * from c.person $$ language sql stable;
create function c.table_set_mutation() returns setof c.person as $$ select * from c.person $$ language sql;
create function c.int_set_query(x int, y int, z int) returns setof integer as $$ values (1), (2), (3), (4), (x), (y), (z) $$ language sql stable;
create function c.int_set_mutation(x int, y int, z int) returns setof integer as $$ values (1), (2), (3), (4), (x), (y), (z) $$ language sql;
create function c.no_args_query() returns int as $$ select 2 $$ language sql stable;
create function c.no_args_mutation() returns int as $$ select 2 $$ language sql;
