create table urls(
  id text primary key not null,
  redirect_to_url text not null,
  user_id text not null,
  constraint fk_user_id_url foreign key (user_id) references user_credentials(id)
);
