export interface Device {
  readonly id: number;
  readonly uniqueId: string;
  readonly groupId: number;
  readonly name: string;
  readonly disabled: boolean;
}

export const retiredUniqueId = (uniqueId: string, deviceId: number): string =>
  `${uniqueId}:retired:${deviceId}`;
