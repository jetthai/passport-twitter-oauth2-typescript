import { Request } from 'express';
import {
  Metadata,
  StateStoreStoreCallback,
  StateStoreVerifyCallback,
  Strategy as OAuth2Strategy,
  VerifyFunction,
  VerifyFunctionWithRequest,
} from 'passport-oauth2';

import { mapUserProfile } from './mapUserProfile';
import { ProfileWithMetaData } from './models';
import {
  isStrategyOptions,
  isStrategyOptionsWithRequest,
  StrategyOptions,
  StrategyOptionsWithRequest,
} from './models/strategyOptions';
import { TwitterError } from './models/twitterError';
import { TwitterUserInfoResponse } from './models/twitterUserInfo';

/**
 * @public
 */
export class Strategy extends OAuth2Strategy {
  _userProfileURL: string;

  /**
   * Twitter strategy constructor
   *
   * Required options:
   *
   *   - `clientID` - your Twitter application's App ID
   *   - `clientSecret` - your Twitter application's App Secret
   *   - `callbackURL` - URL to which Twitter will redirect the user after granting authorization
   *   - `clientType` - your Twitter application (client) type, either `public` or `confidental`
   *
   * @remarks
   * The Twitter authentication strategy authenticates requests by delegating to
   * Twitter using the OAuth 2.0 protocol.
   *
   * Applications must supply a `verify` callback which accepts an `accessToken`,
   * `refreshToken` and service-specific `profile`, and then calls the `cb`
   * callback supplying a `user`, which should be set to `false` if the
   * credentials are not valid.  If an exception occured, `err` should be set.
   *
   * @example
   * ```
   * passport.use(new TwitterStrategy({
   *     clientType: 'confidential',
   *     clientID: 'client-identification',
   *     clientSecret: 'secret'
   *     callbackURL: 'https://www.example.net/auth/twitter/callback'
   *   },
   *   function(accessToken, refreshToken, profile, cb) {
   *     User.findOrCreate(..., function (err, user) {
   *       cb(err, user);
   *     });
   *   }
   * ));
   * ```
   */
  constructor(userOptions: StrategyOptions, verify: VerifyFunction);
  constructor(
    userOptions: StrategyOptionsWithRequest,
    verify: VerifyFunctionWithRequest
  );
  constructor(
    userOptions: StrategyOptions | StrategyOptionsWithRequest,
    verify: VerifyFunction | VerifyFunctionWithRequest
  ) {
    const options = Strategy.buildStrategyOptions(userOptions);

    if (isStrategyOptions(options)) {
      super(options, verify as VerifyFunction);
    } else if (isStrategyOptionsWithRequest(options)) {
      super(options, verify as VerifyFunctionWithRequest);
    } else {
      throw Error('Strategy options not supported.');
    }

    this.name = 'twitter';
    this._userProfileURL =
      options.userProfileURL ||
      'https://api.twitter.com/2/users/me?user.fields=profile_image_url,url';

    let scope = options.scope || [];
    if (!Array.isArray(scope)) {
      scope = [scope];
    }
    options.scope = this.addDefaultScopes(scope, options);
  }

  static buildStrategyOptions(
    userOptions: StrategyOptions | StrategyOptionsWithRequest
  ) {
    const options = (userOptions || {}) as
      | StrategyOptions
      | StrategyOptionsWithRequest;
    options.sessionKey = options.sessionKey || 'oauth:twitter';
    const authorizationURL =
      options.authorizationURL || 'https://x.com/i/oauth2/authorize';
    const tokenURL =
      options.tokenURL || 'https://api.twitter.com/2/oauth2/token';

    // Twitter requires clients to use PKCE (RFC 7636)
    // options.pkce = true;

    // PKCE with Passport requires to enable sessions
    // options.state = true;

    options.store = {
      verify: (
        req: Request,
        state: string,
        metaOrCb: Metadata | StateStoreVerifyCallback,
        maybeCb?: StateStoreVerifyCallback
      ): void => {
        let cb: StateStoreVerifyCallback;
        let meta: Metadata | undefined;

        if (typeof metaOrCb === 'function') {
          cb = metaOrCb;
        } else {
          meta = metaOrCb;
          cb = maybeCb;
        }

        cb(null, true, meta);
      },
      store: (
        req: Request,
        metaOrCb: Metadata | StateStoreStoreCallback,
        maybeCb?: StateStoreStoreCallback
      ): void => {
        let cb: StateStoreStoreCallback;
        if (typeof metaOrCb === 'function') {
          cb = metaOrCb;
        } else {
          cb = maybeCb;
        }

        cb(null, true);
      },
    };

    if (options.clientType === 'confidential') {
      // Private client type is deprecated
      // Twitter requires that OAuth2 client credentials are passed in Authorization header for confidential client types.
      // This is workaround as passport-oauth2 and node-oauth libs doesn't support it.
      // See Twitter docs: https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token
      options.customHeaders = {
        ...{
          Authorization:
            'Basic ' +
            Buffer.from(`${options.clientID}:${options.clientSecret}`).toString(
              'base64'
            ),
        },
        ...(options.customHeaders || {}),
      };
    }

    return {
      ...options,
      authorizationURL,
      tokenURL,
    };
  }
  authorizationParams() {
    return {
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    };
  }

  tokenParams() {
    return {
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    };
  }

  /**
   * Retrieve user profile from Twitter.
   *
   * @remarks
   * This function fetches Twitter user info and maps it to normalized profile,
   * with the following properties parsed from Twitter user info response:
   *
   *   - `id`
   *   - `username`
   *   - `displayName`
   *   - `profileUrl`
   *   - `photos`
   */
  userProfile(
    accessToken: string,
    done: (error: Error | null, user?: ProfileWithMetaData) => void
  ) {
    const url = new URL(this._userProfileURL);

    this._oauth2.useAuthorizationHeaderforGET(true);
    this._oauth2.get(url.toString(), accessToken, function (err, body, _res) {
      if (err) {
        let twitterError: TwitterError | undefined = undefined;
        if (err.data && typeof err.data === 'string') {
          try {
            twitterError = JSON.parse(err.data) as unknown as TwitterError;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_) {
            return done(
              new OAuth2Strategy.InternalOAuthError(
                'Failed to fetch user profile',
                err
              )
            );
          }
        }

        if (twitterError && twitterError.errors && twitterError.errors.length) {
          const e = twitterError.errors[0];

          return done(new Error(e.message, { cause: { code: e.code } }));
        }

        return done(
          new OAuth2Strategy.InternalOAuthError(
            'Failed to fetch user profile',
            err
          )
        );
      }

      if (body === undefined) {
        return done(new Error('Failed to fetch valid user profile'));
      }

      let twitterUserInfoResponse: TwitterUserInfoResponse;

      try {
        body = body === typeof 'string' ? body : body.toString();
        twitterUserInfoResponse = JSON.parse(
          body
        ) as unknown as TwitterUserInfoResponse;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (ex) {
        return done(new Error('Failed to parse user profile'));
      }

      const userProfile = mapUserProfile(twitterUserInfoResponse.data);

      const userProfileWithMetadata: ProfileWithMetaData = {
        ...userProfile,
        _raw: body,
        _json: twitterUserInfoResponse.data,
      };

      done(null, userProfileWithMetadata);
    });
  }

  addDefaultScopes(
    scopes: string[],
    options: StrategyOptions | StrategyOptionsWithRequest
  ) {
    let skipUserProfile = false;
    const skipUserProfileOption = options.skipUserProfile as unknown;

    if (
      typeof skipUserProfileOption === 'function' &&
      skipUserProfileOption.length === 1
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
      skipUserProfile = skipUserProfileOption();
    }

    if (typeof skipUserProfileOption !== 'function') {
      skipUserProfile = !!skipUserProfileOption;
    }

    if (!skipUserProfile) {
      scopes.push('users.read');
    }

    return scopes;
  }
}
