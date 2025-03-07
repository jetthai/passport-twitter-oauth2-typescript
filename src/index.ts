/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Strategy } from './strategy';

export type {
  Profile,
  ProfileWithMetaData,
  StrategyOptions,
  StrategyOptionsWithRequest,
  AuthenticateOptions,
} from './models';
export { Strategy };

exports = module.exports = Strategy;
exports.Strategy = Strategy;
