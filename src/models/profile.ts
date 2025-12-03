/**
 * @public
 */
export interface Profile {
  username: string;
  profileUrl: string;
  // custom profile properties
  name?: string;
  picture?: string;
  // default
  provider: string;
  id: string;
  displayName: string;
  emails?: Array<{
    value: string;
    type?: string;
  }>;
  photos?: Array<{
    value: string;
  }>;
}

/**
 * @public
 */
export interface ProfileWithMetaData extends Profile {
  _raw?: string | Buffer;
  _json: unknown;
}
