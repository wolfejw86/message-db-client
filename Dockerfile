FROM postgres:12

RUN apt-get update && apt-get install -y curl
RUN mkdir -p /usr/src/eventide
RUN curl -L https://github.com/message-db/message-db/archive/v1.2.3.tar.gz -o /usr/src/eventide/message-db.tgz
RUN tar -xf /usr/src/eventide/message-db.tgz --directory /usr/src/eventide

COPY installEventideMessageDb.sh /docker-entrypoint-initdb.d/

ENV PGDATA /data

RUN docker-entrypoint.sh postgres --version

ENTRYPOINT docker-entrypoint.sh postgres
