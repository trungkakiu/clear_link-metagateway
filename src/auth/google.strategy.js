import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import db from "../models/metadatabase/index.js";
import Helper__funtion from "../utils/Helper__funtion.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;

      let user = await db.Actor_model.findOne({ where: { email } });
      if (!user) {
        do {
          const user_id = Helper__funtion.genId("USER_");
          const existingUser = await db.Actor_model.findOne({
            where: { id: user_id },
          });
          if (!existingUser) {
            profile.id = user_id;
            break;
          }
        } while (false);
        user = await db.Actor_model.create({
          email,
          id: profile.id,
          avtar_url: profile.photos[0].value,
          name: profile.displayName,
          password: "GOOGLE_OAUTH_USER",
          public_key: "null",
          role: "user",
          provider: "google",
        });
      }

      return done(null, user);
    }
  )
);
