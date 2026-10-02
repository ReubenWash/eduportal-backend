ALTER TABLE "classes"
  ALTER COLUMN "level" TYPE TEXT
  USING "level"::TEXT;

DROP TYPE "JHSLevel";
