"use strict";
/*
  Import modules
*/
import bluebird = require("bluebird");
import bodyParser = require("body-parser");
import cors = require("cors");
import express = require("express");
const graphqlHTTP = require("express-graphql");
import fs = require("fs");
import { buildSchema } from "graphql";
import jwt = require("jsonwebtoken");
import Sequelize from "sequelize";
import { databaseString } from "./functions/infoString";
import { generateHash, UserSchema } from "./schemas";

import { Config } from "./shared";
global.Promise = bluebird;

/**
 * @exports Hasura
 * @class
 * @method startServer
 * @method initEnv
 * @method initWinston
 * @method initExpress
 * @method initCORS
 * @method initAppRoutes
 * @method initServices
 */
export class Hasura {
  public infoString: string;
  public port: any;
  private pkg = require("../package.json"); // information about package version
  private winston: any = require("winston"); // for logging
  private app: any; // express server
  constructor(private portGiven) {
    this.infoString = databaseString();
    this.port = portGiven;
  }

  /**
   * This starts express server
   * @method startServer @public
   */
  public startServer() {
    this.initEnv().then(() => {
      // logs/ Folder already
      // Initilatizing the winston as per documentation
      this.initWinston();

      this.initServices().then(() => {

        // start the express server(s)
        this.initExpress();

        // all done
        this.winston.info(this.pkg.name + " startup sequence completed", {
          version: this.pkg.version,
        });
      });
    });
  }

  /**
   * This setups the log folder and any other environment needs
   * @method initEnv @private
   * @returns {Promise<void>}
   */
  private initEnv(): Promise<void> {
    return new Promise<void>((resolve) => {
      const logPath: string = Config.serviceSettings.logsDir;
      fs.stat(logPath, (err) => {
        resolve();
      });
    });
  }

  /**
   * This Initilatizes the winston
   * @method initWinston @private
   */
  private initWinston() {
    // winston is configured as a private variable to the main app.ts
    // it can then be spread to child modules or routeModules. This way only one winston object needs to be setup
    this.winston.remove(this.winston.transports.Console);
    this.winston.add(this.winston.transports.Console, {
      colorize: true,
      prettyPrint: true,
      timestamp: true,
    });

    this.winston.add(this.winston.transports.File, {
      name: "error",
      level: "error",
      filename: "logs/error.log",
      maxsize: 10485760,
      maxFiles: "10",
      timestamp: true,
    });
    this.winston.add(this.winston.transports.File, {
      name: "warn",
      level: "warn",
      filename: "logs/warn.log",
      maxsize: 10485760,
      maxFiles: "10",
      timestamp: true,
    });
    this.winston.add(this.winston.transports.File, {
      name: "info",
      level: "info",
      filename: "logs/info.log",
      maxsize: 10485760,
      maxFiles: "10",
      timestamp: true,
    });
    this.winston.add(this.winston.transports.File, {
      name: "verbose",
      level: "verbose",
      filename: "logs/verbose.log",
      maxsize: 10485760,
      maxFiles: "10",
      timestamp: true,
    });

    this.winston.info("Winston has been init");
  }

  /**
   * This Initilatizes express server
   * @method initExpress @private
   */
  private initExpress() {
    // create express
    this.app = express();
    this.initCORS();
    // make express use the bodyParser for json middleware
    this.app.use(bodyParser.json({}));

    // add in any routes you might want
    this.initAppRoutes();

    // and start!
    this.app.listen(this.port);
    this.winston.info("Express started on (http://localhost:" + this.port + "/)");
  }

  /**
   * This Initilatizes cors package
   * @method initCORS @private
   */
  private initCORS() {
    this.app.use(cors());
  }

  /**
   * This Initilatizes routes for server
   * @method initAppRoutes @private
   */
  private initAppRoutes() {

    const schema = buildSchema(`
      type Mutation {
        createUser(username: String!, name: String!, password: String!) : User
      }

      type User {
        id: ID!
        username: String!,
        name: String!,
        password: String!,
      }

      type Query {
        hello: String
        test: String
      }
    `);

    const root = {
      hello: () => {
        return "Hello world!";
      },

      test: () => {
        return "I am world";
      },

      createUser: (args) => {
        UserSchema.sync({ force: true }).then(() => {
          UserSchema.findOne({ username: args.username }).then((user: any) => {
            if (user !== null) {
              console.log("user already");
              return "User already there";
            } else {
              // generating new hashed password
              const password = generateHash(args.password);
              const secret: any = Config.secretKeys.jwtSecret;
              const token = jwt.sign({ id: args.username }, secret, {
                expiresIn: "23h",
              });
              // Table created
              UserSchema.create({
                username: args.username,
                name: args.name,
                password,
              }).then((val) => {
                return {
                  id: val.id,
                  username: args.username,
                  name: args.name,
                  password,
                };
              });
            }
          });
        });
      },
    };

    this.app.use("/graphql", graphqlHTTP({
      schema,
      rootValue: root,
      graphiql: true,
    }));
  }

  /**
   * This Initilatizes services we want if expanding the application
   * @method initServices @private
   * @returns {Promise<boolean>}
   */
  private initServices(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      // connect to postgres
      new Sequelize(this.infoString, { operatorsAliases: false }).authenticate()
        .then(() => {
          this.winston.info("Potgress connected successfully.");
          resolve(true);
        });
    });
  }
}
