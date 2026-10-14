import { ActorDirectory } from "../actors/ActorDirectory";
import { ItemDirectory, JournalDirectory, SceneDirectory } from "./DocumentDirectory";

export const DIRECTORY_CLASSES = [SceneDirectory, ActorDirectory, ItemDirectory, JournalDirectory] as const;
