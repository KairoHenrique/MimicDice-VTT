import { roleHasPermission, type ConfiguredPermissions, type UserPermissionName } from "@tabbletop/common";
import { USER_ROLES, type OnlineUserRecord } from "@tabbletop/protocol";
import { ClientDocumentMixin } from "../documents/abstract/ClientDocumentMixin";
import { BaseUser } from "../documents/baseDocuments";
import { WorldCollection } from "../documents/collections";
import { currentCanvas, currentGame } from "../runtime";

type RoleReference = number | keyof typeof USER_ROLES;

function resolveRole(role: RoleReference): number {
  return typeof role === "string" ? USER_ROLES[role] : role;
}

function configuredPermissions(): ConfiguredPermissions {
  try {
    return (currentGame()?.settings?.get("core", "permissions") as ConfiguredPermissions) ?? {};
  } catch {
    return {};
  }
}

export class User extends ClientDocumentMixin(BaseUser) {
  declare active: boolean;

  static fromRecord({ active, ...record }: OnlineUserRecord): User {
    const user = new this(structuredClone(record));
    user.active = active;
    return user;
  }

  get isGM(): boolean {
    return this.hasRole(USER_ROLES.ASSISTANT);
  }

  get isSelf(): boolean {
    return currentGame()?.userId === this.id;
  }

  get isTrusted(): boolean {
    return this.hasRole(USER_ROLES.TRUSTED);
  }

  get isBanned(): boolean {
    return this.role === USER_ROLES.NONE;
  }

  /** Other users' views are not synchronized yet, so they are assumed to be on the active scene. */
  get viewedScene(): string | null {
    const game = currentGame();
    if (this.isSelf) return currentCanvas()?.scene?.id ?? game?.scenes?.active?.id ?? null;
    return game?.scenes?.active?.id ?? null;
  }

  override getUserLevel(user = currentGame()?.user): number {
    if (!user) return 0;
    return user.isGM || user.id === this.id ? 3 : 1;
  }

  hasRole(role: RoleReference, { exact = false }: { exact?: boolean } = {}): boolean {
    const requiredRole = resolveRole(role);
    return exact ? this.role === requiredRole : this.role >= requiredRole;
  }

  isRole(role: RoleReference): boolean {
    return this.hasRole(role, { exact: true });
  }

  can(permission: UserPermissionName | string): boolean {
    if (this.role === USER_ROLES.GAMEMASTER) return true;
    if (permission in USER_ROLES) return this.hasRole(permission as keyof typeof USER_ROLES);
    return roleHasPermission(this.role, permission as UserPermissionName, configuredPermissions());
  }

  hasPermission(permission: UserPermissionName | string): boolean {
    return this.can(permission);
  }

  broadcastActivity(): void {}
}

export class Users extends WorldCollection {
  static override documentName = "User";

  get current(): User | undefined {
    return currentGame()?.user;
  }

  get players(): User[] {
    return this.filter((user: User) => !user.isGM && user.hasRole(USER_ROLES.PLAYER));
  }

  get activeGM(): User | null {
    const activeGameMasters: User[] = this.filter((user: User) => user.active && user.isGM);
    activeGameMasters.sort((left, right) => right.role - left.role || left.id.localeCompare(right.id));
    return activeGameMasters[0] ?? null;
  }
}
