CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS config (
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	config_path varchar NOT NULL,
	"data" json NULL,
	CONSTRAINT config_pk PRIMARY KEY (id),
	CONSTRAINT config_un UNIQUE (config_path)
);
