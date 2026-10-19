import { detectVendorFromSshVersion } from "./sshServerVendor.mjs";
import { remoteSoftwareRequiresSingleChannel } from "./singleChannelSshBanner.shared.mjs";

/**
 * True when SFTP must dial its own SSH login.
 * An extra channel on the terminal transport disconnects Huawei VRP, Ruijie,
 * and other gear that advertises a network-vendor banner (#3631, #1043), and
 * the same is true for one-channel bastions and Network Device Mode.
 */
export function sftpRequiresDedicatedConnection(opts = {}) {
  if (!opts || typeof opts !== "object") return false;
  if (opts.singleChannelSsh) return true;
  if (opts.deviceType === "network") return true;
  const remoteSshVersion = opts.remoteSshVersion || "";
  return remoteSoftwareRequiresSingleChannel(remoteSshVersion)
    || Boolean(detectVendorFromSshVersion(remoteSshVersion));
}
