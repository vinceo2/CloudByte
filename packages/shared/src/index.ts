export enum UserTier {
  Free = 'free',
  Pro = 'pro',
  Enterprise = 'enterprise',
}

export const TIER_STORAGE_LIMITS: Record<UserTier, number> = {
  [UserTier.Free]: 10 * 1024 * 1024 * 1024,
  [UserTier.Pro]: 100 * 1024 * 1024 * 1024,
  [UserTier.Enterprise]: 1024 * 1024 * 1024 * 1024,
};

export enum SharePermission {
  Read = 'read',
  Upload = 'upload',
  Delete = 'delete',
  Share = 'share',
}

export interface FileNode {
  id: string;
  name: string;
  isFolder: boolean;
  parentId: string | null;
  mimeType: string | null;
  sizeBytes: number;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  tier: UserTier;
  storageUsedBytes: number;
  storageLimitBytes: number;
}

export interface ShareGrant {
  id: string;
  resourceId: string;
  granteeEmail: string;
  permissions: SharePermission[];
  createdAt: string;
}
