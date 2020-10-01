create table user_credentials
(
  id text primary key not null,
  email text not null,
  password_hash text not null
);

create index on user_credentials(email);
