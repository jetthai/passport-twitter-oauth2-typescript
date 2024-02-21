/* eslint-disable prettier/prettier */
/**
 * @public
 */
export interface Profile {
  username: string;
  profileUrl: string;
  // custom profile properties
  name: string | undefined;
  picture?: string | undefined;
  // default
  provider: string;
  id: string;
  displayName: string;
  emails?: Array<{
    value: string;
    type?: string | undefined;
  }> | undefined;
  photos?: Array<{
    value: string;
  }> | undefined;
}

/**
 * @public
 */
export interface ProfileWithMetaData extends Profile {
  _raw: string | Buffer | undefined;
  _json: unknown;
}
