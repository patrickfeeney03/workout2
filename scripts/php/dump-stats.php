<?php

declare(strict_types=1);

/**
 * Golden-master dump for Service\StatsService::dashboard().
 *
 * Runs on the PHP box (PHP 8.5 + pdo_sqlite) against a checkout of the old PHP
 * app. Point it at the PHP app root - the directory holding `src/bootstrap.php`
 * and `data/gym_schema.sql` - either as an argument or via PHP_GYM_ROOT:
 *
 *   php scripts/php/dump-stats.php /var/www/notes > /tmp/stats.json
 *
 * With neither, it falls back to the legacy `<php-app>/gym-web/scripts/php`
 * layout this script used to live in.
 *
 * Output shape:
 *   { "generatedAt": "...", "phpVersion": "...", "cases": [ { "params": {...}, "dashboard": {...} } ] }
 *
 * Exits non-zero with a message on stderr if a case throws.
 */

use Service\StatsService;

$phpRoot = getenv('PHP_GYM_ROOT') ?: ($argv[1] ?? '');
if ($phpRoot === '') {
    $phpRoot = dirname(__DIR__, 3);
}
$phpRoot = rtrim($phpRoot, '/');
$bootstrap = $phpRoot . '/src/bootstrap.php';
if (!is_readable($bootstrap)) {
    fwrite(STDERR, "[dump-stats] cannot find PHP app bootstrap at {$bootstrap}\n");
    fwrite(STDERR, "[dump-stats] usage: php scripts/php/dump-stats.php /path/to/php-app\n");
    exit(1);
}

require_once $bootstrap;

/**
 * In-memory SQLite DB, mirroring tests/support/database.php::createTestDb().
 */
function createStatsDb(string $phpRoot): PDO
{
    $schemaPath = $phpRoot . '/data/gym_schema.sql';
    if (!is_readable($schemaPath)) {
        throw new RuntimeException("Schema not found: {$schemaPath}");
    }

    $db = new PDO('sqlite::memory:');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec((string) file_get_contents($schemaPath));

    // createTestDb() seeds user 1. Stats never reads password_hash, so it is
    // left NULL here instead of copying a real hash into the repo.
    $db->exec("INSERT INTO users (id, name, email) VALUES (1, 'Test User', 'test@example.com')");

    return $db;
}

/**
 * Verbatim copy of tests/support/stats_fixtures.php::seedStatsFixtures().
 * User 1 (and its password hash) is created by createStatsDb().
 */
function seedStatsFixtures(PDO $db): void
{
    $db->exec("INSERT INTO users (id, name, email) VALUES (2, 'Other', 'other@example.com')");
    $db->exec("INSERT INTO movement_patterns (id, name) VALUES (1, 'Squat')");
    $db->exec("INSERT INTO exercises (id, user_id, name, movement_pattern_id)
               VALUES (1, 1, 'Back Squat', 1)");
    $db->exec("INSERT INTO exercises (id, user_id, name)
               VALUES (2, 1, 'Bench')");
    $db->exec("INSERT INTO exercises (id, user_id, name)
               VALUES (3, 2, 'Secret Lift')");

    $db->exec("INSERT INTO training_blocks (id, user_id, name, start_date, end_date)
               VALUES (1, 1, 'Summer Block', '2026-07-01', '2026-08-31')");
    $db->exec("INSERT INTO training_blocks (id, user_id, name, start_date, end_date)
               VALUES (2, 2, 'Other Block', '2026-07-01', '2026-08-31')");
    $db->exec("INSERT INTO block_weeks (id, training_block_id, week_number, week_type)
               VALUES (1, 1, 1, 'Base')");
    $db->exec("INSERT INTO block_weeks (id, training_block_id, week_number, week_type)
               VALUES (2, 1, 2, 'Shock')");
    $db->exec("INSERT INTO block_weeks (id, training_block_id, week_number, week_type)
               VALUES (3, 1, 3, 'Deload')");

    $db->exec("INSERT INTO routines (id, user_id, name, split_name, split_day)
               VALUES (1, 1, 'Lower A', 'Upper lower abs', 'Lower')");
    $db->exec("INSERT INTO routines (id, user_id, name, split_name, split_day)
               VALUES (2, 1, 'Upper B', 'Upper lower abs', 'Upper')");

    $db->exec("INSERT INTO workouts
        (id, user_id, routine_id, block_week_id, title, status, performed_on, body_weight,
         duration_seconds, notes)
        VALUES (1, 1, 1, 1, 'A', 'completed', '2026-08-01', 80, 3600, 'felt good')");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order, notes)
               VALUES (1, 1, 1, 1, 'knees a bit cranky')");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order)
               VALUES (2, 1, 2, 2)");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type, notes)
        VALUES (1, 1, 1, 5, 100, 'working', 'grind')");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (2, 1, 2, 5, 110, 'working')");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (3, 1, 3, 10, 60, 'warmup')");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (4, 2, 1, 8, 80, 'working')");

    $db->exec("INSERT INTO workouts
        (id, user_id, routine_id, block_week_id, title, status, performed_on, body_weight,
         duration_seconds)
        VALUES (2, 1, 2, 3, 'B', 'completed', '2026-08-10', 81, 2700)");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order)
               VALUES (3, 2, 1, 1)");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (5, 3, 1, 3, 120, 'working')");

    $db->exec("INSERT INTO workouts
        (id, user_id, title, status, performed_on)
        VALUES (3, 1, 'Planned', 'planned', '2026-08-11')");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order)
               VALUES (4, 3, 1, 1)");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (6, 4, 1, 5, 200, 'working')");

    $db->exec("INSERT INTO workouts
        (id, user_id, title, status, performed_on, is_deleted)
        VALUES (4, 1, 'Deleted', 'completed', '2026-08-12', 1)");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order)
               VALUES (5, 4, 1, 1)");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (7, 5, 1, 5, 210, 'working')");

    $db->exec("INSERT INTO workouts
        (id, user_id, title, status, performed_on)
        VALUES (5, 2, 'Other user', 'completed', '2026-08-01')");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order)
               VALUES (6, 5, 3, 1)");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (8, 6, 1, 5, 400, 'working')");

    $db->exec("INSERT INTO workouts
        (id, user_id, title, status, performed_on)
        VALUES (6, 1, 'Old', 'completed', '2026-01-02')");
    $db->exec("INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order)
               VALUES (7, 6, 2, 1)");
    $db->exec("INSERT INTO workout_sets
        (id, workout_exercise_id, set_number, actual_reps, actual_weight, set_type)
        VALUES (9, 7, 1, 5, 70, 'working')");
}

/**
 * Signature: dashboard(PDO $db, int $userId, string $range, ?int $exerciseId,
 * ?int $blockId, ?string $today). `$today` pins the window so the golden
 * values are deterministic (mirrors tests/integration/stats_service_test.php).
 */
$cases = [
    ['userId' => 1, 'range' => 'all', 'exerciseId' => null, 'blockId' => null, 'today' => '2026-08-19'],
    ['userId' => 1, 'range' => '12w', 'exerciseId' => 1, 'blockId' => null, 'today' => '2026-08-19'],
    ['userId' => 1, 'range' => 'block', 'exerciseId' => 1, 'blockId' => 1, 'today' => '2026-08-19'],
    ['userId' => 2, 'range' => 'all', 'exerciseId' => null, 'blockId' => null, 'today' => '2026-08-19'],
];

$out = [
    'generatedAt' => gmdate('c'),
    'phpVersion' => PHP_VERSION,
    'cases' => [],
];

foreach ($cases as $case) {
    try {
        $db = createStatsDb($phpRoot);
        seedStatsFixtures($db);
        $dash = StatsService::dashboard(
            $db,
            $case['userId'],
            $case['range'],
            $case['exerciseId'],
            $case['blockId'],
            $case['today']
        );
    } catch (Throwable $e) {
        fwrite(STDERR, sprintf(
            "[dump-stats] case %s failed: %s (%s:%d)\n",
            (string) json_encode($case),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine()
        ));
        exit(1);
    }

    $out['cases'][] = ['params' => $case, 'dashboard' => $dash];
}

$json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($json === false) {
    fwrite(STDERR, "[dump-stats] json_encode failed: " . json_last_error_msg() . "\n");
    exit(1);
}

fwrite(STDOUT, $json . "\n");
