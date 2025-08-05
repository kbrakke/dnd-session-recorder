import type { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type Account = {
  provider: string;
  type: string;
  providerAccountId: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

type Profile = {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account }: { user: any; account: any }) {
      try {
        if (account?.provider === 'google') {
          // Check if user exists in database
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
          });

          if (!existingUser) {
            // Create user if doesn't exist
            const newUser = await prisma.user.create({
              data: {
                name: user.name,
                email: user.email!,
                image: user.image,
              },
            });
            user.id = newUser.id;
          } else {
            user.id = existingUser.id;
          }
        }
        
        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
        return false;
      }
    },
    async jwt({ token, user }: { token: JWT; user?: any }) {
      // Add user ID to token on first sign in
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: JWT }) {
      try {
        // When using JWT sessions, token object is available
        if (token) {
          session.user.id = token.id as string;
        }
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        return session;
      }
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }: { user: any; account: any; profile?: any; isNewUser?: boolean }) {
      console.log('SignIn event - Success:', { user, account, profile, isNewUser });
    },
    async signOut({ session, token }: { session: any; token?: JWT }) {
      console.log('SignOut event:', { session, token });
    },
    async createUser({ user }: { user: any }) {
      console.log('CreateUser event:', user);
    },
    async linkAccount({ user, account, profile }: { user: any; account: any; profile?: any }) {
      console.log('LinkAccount event:', { user, account, profile });
    },
    async session({ session, token }: { session: any; token?: JWT }) {
      console.log('Session event:', { session, token });
    },
  },
  debug: process.env.NODE_ENV === 'development',
};