import * as jwt from 'jsonwebtoken';

import { Resolvers, UserResolvers } from '../generated/graphql';
import { checkPassword, encryptPassword } from '../utils/encryption';

import { AuthenticationError } from 'apollo-server-express';
import { Role } from '../types';
import { withFilter } from 'apollo-server';

const USER_ADDED = 'USER_ADDED';
const USER_UPDATED = 'USER_UPDATED';

const resolver: Resolvers = {
  Query: {
    users: async (_, args, { getUser, models }, info) => {
      const user = await getUser();
      if (!user) throw new AuthenticationError('User is not logged in');
      return models.User.findAll();
    },
    user: (_, args, { models }) => models.User.findOne({ where: args }),
  },
  Mutation: {
    signInGoogle: async (_, args, { appSecret, models, pubsub }) => {
      try {
        if (args.socialUser.email) {
          const emailUser = await models.User.findOne({
            where: {
              email: args.socialUser.email,
              social: { $notLike: 'google%' },
            },
            raw: true,
          });

          if (emailUser) {
            throw new Error('Email for current user is already signed in');
          }
        }

        const user = await models.User.findOrCreate({
          where: { social: `google_${args.socialUser.social}` },
          defaults: {
            social: `google_${args.socialUser.social}`,
            email: args.socialUser.email,
            name: args.socialUser.name,
            nickname: args.socialUser.nickname,
            photo: args.socialUser.photo,
            birthday: args.socialUser.birthday,
            gender: args.socialUser.gender,
            phone: args.socialUser.phone,
            verified: args.socialUser.email || false,
          },
          raw: true,
        });
        if (!user || (user && user[1] === false)) {
          // user exists
        }

        const token: string = jwt.sign(
          {
            userId: user[0].id,
            role: Role.User,
          },
          appSecret,
        );
        return { token, user: user[0] };
      } catch (err) {
        throw new Error(err);
      }
    },
    signInFacebook: async (_, args, { appSecret, models, pubsub }) => {
      try {
        if (args.socialUser.email) {
          const emailUser = await models.User.findOne({
            where: {
              email: args.socialUser.email,
              social: { $notLike: 'facebook%' },
            },
            raw: true,
          });

          if (emailUser) {
            throw new Error('Email for current user is already signed in');
          }
        }

        const user = await models.User.findOrCreate({
          where: { social: `facebook_${args.socialUser.social}` },
          defaults: {
            social: `facebook_${args.socialUser.social}`,
            email: args.socialUser.email,
            nickname: args.socialUser.name,
            name: args.socialUser.name,
            birthday: args.socialUser.birthday,
            gender: args.socialUser.gender,
            phone: args.socialUser.phone,
            verified: args.socialUser.email || false,
          },
          raw: true,
        });

        if (!user || (user && user[1] === false)) {
          // user exists
        }

        const token: string = jwt.sign(
          {
            userId: user[0].id,
            role: Role.User,
          },
          appSecret,
        );
        return { token, user: user[0] };
      } catch (err) {
        throw new Error(err);
      }
    },
    signUp: async (_, args, { appSecret, models, pubsub }) => {
      const emailUser: any = await models.User.findOne({
        where: {
          email: args.user.email,
        },
        raw: true,
      });

      if (emailUser) {
        throw new Error('Email for current user is already signed up.');
      }
      args.user.password = await encryptPassword(args.user.password);
      const user = await models.User.create(args.user, { raw: true });
      const token: string = jwt.sign(
        {
          userId: user.id,
          role: Role.User,
        },
        appSecret,
      );

      pubsub.publish(USER_ADDED, {
        userAdded: user,
      });
      return { token, user };
    },
    updateProfile: async (_, args, { appSecret, getUser, models, pubsub }) => {
      try {
        const auth = await getUser();
        if (auth.id !== args.user.id) {
          throw new AuthenticationError(
            'User can update his or her own profile',
          );
        }
        models.User.update(
          args,
          {
            where: {
              id: args.user.id,
            },
          },
          { raw: true },
        );

        const user = await models.User.findOne({
          where: {
            id: args.user.id,
          },
          raw: true,
        });

        pubsub.publish(USER_UPDATED, { user });
        return user;
      } catch (err) {
        throw new Error(err);
      }
    },
  },
  Subscription: {
    userAdded: {
      subscribe: (_, args, { pubsub }) => pubsub.asyncIterator(USER_ADDED),
    },
    userUpdated: {
      subscribe: withFilter(
        (_, args, { pubsub }) => pubsub.asyncIterator(USER_UPDATED),
        (payload, variables) => {
          return payload.userUpdated.id === variables.id;
        },
      ),
    },
  },
  User: {
    notifications: (_, args, { models }, info) => {
      return models.Notification.findAll({
        where: {
          userId: _.id,
        },
      });
    },
    reviews: (_, args, { models }, info) => {
      return models.Review.findAll({
        where: {
          userId: _.id,
        },
      });
    },
  },
};

export default resolver;
