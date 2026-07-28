export enum UserTier {
  Free = 'free',
  Pro = 'pro',
  Enterprise = 'enterprise',
}

import bytes from 'bytes';

export const TIER_STORAGE_LIMITS: Record<UserTier, number> = {
  [UserTier.Free]: bytes.parse('10gb') as unknown as number,
  [UserTier.Pro]: bytes.parse('100gb') as unknown as number,
  [UserTier.Enterprise]: bytes.parse('1tb') as unknown as number,
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
