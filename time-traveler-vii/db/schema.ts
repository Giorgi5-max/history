import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('accounts',{id:text('id').primaryKey(),name:text('name').notNull(),role:text('role').notNull(),credential:text('credential').notNull().unique(),salt:text('salt').notNull(),active:integer('active').notNull().default(1),createdAt:integer('created_at').notNull()});
export const sessions=sqliteTable('sessions',{token:text('token').primaryKey(),accountId:text('account_id').notNull(),expires:integer('expires').notNull()});
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const lessonEdits=sqliteTable('lesson_edits',{id:integer('id').primaryKey(),data:text('data').notNull(),updatedAt:integer('updated_at').notNull()});
export const videos=sqliteTable('videos',{lessonId:integer('lesson_id').primaryKey(),type:text('type').notNull(),source:text('source').notNull(),title:text('title').notNull(),description:text('description').notNull().default(''),updatedAt:integer('updated_at').notNull()});
export const progress=sqliteTable('progress',{accountId:text('account_id').notNull(),lessonId:integer('lesson_id').notNull(),data:text('data').notNull(),updatedAt:integer('updated_at').notNull()},t=>[uniqueIndex('progress_account_lesson').on(t.accountId,t.lessonId)]);
export const attempts=sqliteTable('attempts',{id:text('id').primaryKey(),accountId:text('account_id').notNull(),lessonId:integer('lesson_id').notNull(),score:integer('score').notNull(),total:integer('total').notNull(),data:text('data').notNull(),createdAt:integer('created_at').notNull()});
export const loginLimits=sqliteTable('login_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),resetAt:integer('reset_at').notNull()});
