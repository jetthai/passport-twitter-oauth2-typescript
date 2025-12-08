import base64url from 'base64url';
import crypto from 'crypto';
import {
  Strategy as OAuth2Strategy,
  StrategyOptions as PassportOAuth2StrategyOptions,
  StrategyOptionsWithRequest as PassportOAuth2StrategyOptionsWithRequest,
  VerifyFunction,
  VerifyFunctionWithRequest,
} from 'passport-oauth2';
import url from 'url';

import { mapUserProfile } from './mapUserProfile';
import { ProfileWithMetaData } from './models';
import {
  AuthenticateOptions,
  isStrategyOptions,
  isStrategyOptionsWithRequest,
  PKCEStore,
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
  _useRealPKCE: boolean;
  // These properties exist on passport-oauth2 Strategy but are not typed
  declare _stateStore: PKCEStore;
  declare _callbackURL: string;
  declare _scope: string | string[];

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

    // Cast to passport-oauth2 types to allow custom PKCEStore
    // The actual runtime behavior is compatible with passport-oauth2's expectations
    if (isStrategyOptions(options)) {
      super(
        options as unknown as PassportOAuth2StrategyOptions,
        verify as VerifyFunction
      );
    } else if (isStrategyOptionsWithRequest(options)) {
      super(
        options as unknown as PassportOAuth2StrategyOptionsWithRequest,
        verify as VerifyFunctionWithRequest
      );
    } else {
      throw Error('Strategy options not supported.');
    }

    this.name = 'twitter';
    this._userProfileURL =
      options.userProfileURL ||
      'https://api.twitter.com/2/users/me?user.fields=profile_image_url,url';

    // Track if real PKCE is being used (custom store provided)
    this._useRealPKCE = !!userOptions.store;

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
    // We use a simplified PKCE bypass with a fixed challenge/verifier
    // If a custom store is provided, use real PKCE instead
    /* eslint-disable @typescript-eslint/no-redundant-type-constituents */
    if (!options.store) {
      type StoreCb = (err: Error | null, state?: string) => void;
      type VerifyCb = (
        err: Error | null,
        ok?: string | false,
        state?: string
      ) => void;

      options.store = {
        store: (
          _req: unknown,
          _verifier: string,
          _state: unknown,
          _meta: unknown,
          cb: StoreCb
        ) => {
          cb(null, 'state');
        },
        verify: (_req: unknown, _state: string, cb: VerifyCb) => {
          cb(null, 'challenge', 'state');
        },
      };
    }
    /* eslint-enable @typescript-eslint/no-redundant-type-constituents */

    options.pkce = true;
    options.state = true;

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
    done: (error: Error, user?: ProfileWithMetaData) => void
  ) {
    const url = new URL(this._userProfileURL);

    this._oauth2.useAuthorizationHeaderforGET(true);
    this._oauth2.get(url.toString(), accessToken, function (err, body, _res) {
      if (err) {
        let twitterError: TwitterError = undefined;
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

  /**
   * Return extra parameters to be included in the authorization request.
   * When using real PKCE (custom store), passport-oauth2 handles this automatically.
   * When using fake PKCE (no custom store), returns a fixed code_challenge.
   */
  authorizationParams(): object {
    if (this._useRealPKCE) {
      // Let passport-oauth2 handle real PKCE
      return {};
    }
    // Fake PKCE bypass with fixed challenge
    return {
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    };
  }

  /**
   * Return extra parameters to be included in the token request.
   * When using real PKCE (custom store), passport-oauth2 handles this automatically.
   * When using fake PKCE (no custom store), returns a fixed code_verifier.
   */
  tokenParams(): object {
    if (this._useRealPKCE) {
      // Let passport-oauth2 handle real PKCE
      return {};
    }
    // Fake PKCE bypass with fixed verifier
    return {
      code_verifier: 'challenge',
    };
  }

  /**
   * Authenticate request with custom PKCE handling.
   *
   * When using a custom PKCEStore with a string state, passport-oauth2 skips
   * calling store.store() and doesn't save the PKCE verifier. This override
   * ensures the store is always called when using real PKCE.
   */
  authenticate(
    req: Parameters<OAuth2Strategy['authenticate']>[0],
    options?: AuthenticateOptions
  ): void {
    // If not using real PKCE, or no string state provided, use default behavior
    if (
      !this._useRealPKCE ||
      !options?.state ||
      typeof options.state !== 'string'
    ) {
      return super.authenticate(req, options);
    }

    // Check if this is a callback (has code parameter)
    const query = req.query as Record<string, unknown>;
    const body = req.body as Record<string, unknown>;
    const hasCode = query?.code || body?.code;
    if (hasCode) {
      // On callback, use default behavior - verify will be called
      return super.authenticate(req, options);
    }

    // Authorization phase with string state and real PKCE
    // We need to manually handle PKCE since passport-oauth2 skips store.store()
    // when state is a string
    const stateStore = this._stateStore;
    const customState = options.state;

    // Access protected _oauth2 properties via type assertion
    const oauth2 = this._oauth2 as unknown as {
      _authorizeUrl: string;
      _accessTokenUrl: string;
      _clientId: string;
    };
    let responded = false;

    // Generate PKCE verifier and challenge (S256 method)
    const verifier = base64url(crypto.pseudoRandomBytes(32));
    const challenge = base64url(
      crypto.createHash('sha256').update(verifier).digest()
    );

    const meta = {
      authorizationURL: oauth2._authorizeUrl,
      tokenURL: oauth2._accessTokenUrl,
      clientID: oauth2._clientId,
    };

    // Call the store to save the verifier
    stateStore.store(req, verifier, customState, meta, (err, handle) => {
      if (responded) {
        return;
      }
      responded = true;

      if (err) {
        return this.error(err);
      }

      // Build authorization URL with PKCE parameters
      const params = this.authorizationParams() as Record<string, string>;
      params.response_type = 'code';
      params.code_challenge = challenge;
      params.code_challenge_method = 'S256';
      params.state = handle || customState;

      // Handle callback URL
      const callbackURL = options.callbackURL || this._callbackURL;
      if (callbackURL) {
        params.redirect_uri = callbackURL;
      }

      // Handle scope
      const scope = options.scope || this._scope;
      if (scope) {
        params.scope = Array.isArray(scope) ? scope.join(' ') : scope;
      }

      // Build the authorization URL
      const parsed = url.parse(oauth2._authorizeUrl, true);
      Object.assign(parsed.query, params);
      parsed.query['client_id'] = oauth2._clientId;
      delete parsed.search;
      const location = url.format(parsed);

      this.redirect(location);
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
