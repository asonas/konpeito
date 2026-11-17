CREATE TABLE `embedding_deletions` (
	`item_id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_embeddings` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`model` text,
	`source_key` text NOT NULL,
	`embedded_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Vectorizeに残るベクトルを後で消せるよう、台帳から消えた記事を控える
-- 記事やフィードの削除で連鎖して消えた行でも動く
CREATE TRIGGER trg_embedding_delete AFTER DELETE ON item_embeddings
WHEN OLD.model IS NOT NULL BEGIN
  INSERT OR IGNORE INTO embedding_deletions (item_id) VALUES (OLD.item_id);
END;
--> statement-breakpoint
CREATE TRIGGER trg_embedding_clear AFTER UPDATE OF model ON item_embeddings
WHEN OLD.model IS NOT NULL AND NEW.model IS NULL BEGIN
  INSERT OR IGNORE INTO embedding_deletions (item_id) VALUES (OLD.item_id);
END;
