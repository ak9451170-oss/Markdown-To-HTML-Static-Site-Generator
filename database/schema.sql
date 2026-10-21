CREATE DATABASE IF NOT EXISTS markdown_converter
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE markdown_converter;

CREATE TABLE IF NOT EXISTS conversions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_name VARCHAR(255) NOT NULL,
  markdown_content LONGTEXT NOT NULL,
  generated_html LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_conversions_created_at (created_at)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
