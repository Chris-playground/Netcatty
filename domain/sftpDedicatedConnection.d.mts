export function sftpRequiresDedicatedConnection(opts?: {
  remoteSshVersion?: string | null;
  deviceType?: string | null;
  singleChannelSsh?: boolean;
}): boolean;
