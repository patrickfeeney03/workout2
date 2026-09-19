-- Gym tracker schema for D1.
-- Ported from data/gym_schema.sql with the three AI-insight tables removed
-- (note_analyses, insight_briefs, insight_jobs) and a sessions table added.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  google_sub TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_google_sub_unique
  ON users(google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE movement_patterns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  equipment TEXT,
  primary_muscle TEXT,
  movement_pattern_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movement_pattern_id) REFERENCES movement_patterns(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE routines (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  split_name TEXT,
  split_day TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE routine_exercises (
  id INTEGER PRIMARY KEY,
  routine_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  sort_order INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  target_rest TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

CREATE TABLE routine_sets (
  id INTEGER PRIMARY KEY,
  routine_exercise_id INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  target_reps REAL,
  target_weight REAL,
  set_type TEXT NOT NULL DEFAULT 'working',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  target_rest TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (routine_exercise_id) REFERENCES routine_exercises(id) ON DELETE CASCADE
);

CREATE TABLE training_blocks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE block_weeks (
  id INTEGER PRIMARY KEY,
  training_block_id INTEGER NOT NULL,
  week_number INTEGER,
  week_type TEXT,
  starts_on TEXT,
  ends_on TEXT,
  notes TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (training_block_id) REFERENCES training_blocks(id) ON DELETE CASCADE
);

CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  routine_id INTEGER,
  block_week_id INTEGER,
  title TEXT NOT NULL,
  planned_on TEXT,
  performed_on TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'completed', 'skipped')),
  duration_seconds INTEGER,
  body_weight REAL,
  notes TEXT,
  cloned_from_workout_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (routine_id) REFERENCES routines(id),
  FOREIGN KEY (block_week_id) REFERENCES block_weeks(id),
  FOREIGN KEY (cloned_from_workout_id) REFERENCES workouts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  sort_order INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  target_rest TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

CREATE TABLE workout_sets (
  id INTEGER PRIMARY KEY,
  workout_exercise_id INTEGER NOT NULL,
  set_number INTEGER,
  target_reps REAL,
  target_weight REAL,
  actual_reps REAL,
  actual_weight REAL,
  duration_seconds INTEGER,
  distance REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  set_type TEXT NOT NULL DEFAULT 'working',
  target_rest TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
);

CREATE TABLE exercise_images (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE TABLE workout_set_media (
  id INTEGER PRIMARY KEY,
  workout_set_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'video',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workout_set_id) REFERENCES workout_sets(id) ON DELETE CASCADE
);

CREATE TRIGGER users_modified_at
AFTER UPDATE ON users
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE users
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER movement_patterns_modified_at
AFTER UPDATE ON movement_patterns
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE movement_patterns
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER exercises_modified_at
AFTER UPDATE ON exercises
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE exercises
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER routines_modified_at
AFTER UPDATE ON routines
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE routines
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER routine_exercises_modified_at
AFTER UPDATE ON routine_exercises
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE routine_exercises
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER routine_sets_modified_at
AFTER UPDATE ON routine_sets
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE routine_sets
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER training_blocks_modified_at
AFTER UPDATE ON training_blocks
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE training_blocks
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER block_weeks_modified_at
AFTER UPDATE ON block_weeks
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE block_weeks
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER workouts_modified_at
AFTER UPDATE ON workouts
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE workouts
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER workout_exercises_modified_at
AFTER UPDATE ON workout_exercises
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE workout_exercises
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

CREATE TRIGGER workout_sets_modified_at
AFTER UPDATE ON workout_sets
FOR EACH ROW
  WHEN OLD.modified_at = NEW.modified_at
    BEGIN
      UPDATE workout_sets
      SET modified_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
