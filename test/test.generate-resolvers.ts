import * as assert from "power-assert";
import { buildSchemaFromTypeDefinitions } from "graphql-tools";
import * as jest from "jest-mock";
import { default as generateResolvers } from "../lib/utils/generate-resolvers";
import onlyObjectTypes from "../lib/utils/only-object-types";
import {
  isDefinedQuery,
  onlyComposite,
  isDefinedMutation
} from "../lib/utils/type-map-utils";

const { keys } = Object;

describe("utils/generate-resolvers", () => {
  describe("root queries", () => {
    let schema, spreadsheet, result;
    describe("are optional", () => {
      beforeEach(() => {
        schema = buildSchemaFromTypeDefinitions(`
          type Product {
            id: Int!
          }

          type Query {
            product: Product
          }
        `);
        spreadsheet = {};
        result = generateResolvers(schema, spreadsheet);
      });
      it("builds Query with only product resolver", () => {
        assert.equal(Object.keys(result.Query).length, 1);
        assert.ok(result.Query.product);
      });
    });
    beforeEach(() => {
      schema = buildSchemaFromTypeDefinitions(`
      type Product {
        id: Int!
      }

      type Query {
        product: Product
        products(id: String!): [Product]
      }
    `);
      spreadsheet = {};
      result = generateResolvers(schema, spreadsheet);
    });

    it("has Query", () => {
      assert.ok(result.Query);
    });

    it("has generated two root resolvers", () => {
      assert.equal(Object.keys(result.Query).length, 2);
    });

    it("has product root resolver", () => {
      assert.ok(result.Query.product);
    });

    it("has products root resolver", () => {
      assert.ok(result.Query.products);
    });

    describe("singular resolver", () => {
      let resolvers;
      beforeEach(async () => {
        spreadsheet = {
          findRecord: jest
            .fn()
            .mockReturnValue(Promise.resolve({ id: "hello-world" }))
        };
        resolvers = generateResolvers(schema, spreadsheet);
        result = await resolvers.Query.product({}, { id: "hello-world" }, {});
      });

      it("invokes spreadsheet.findRecord", () => {
        assert.equal(spreadsheet.findRecord.mock.calls.length, 1);
      });

      it("passes type and id to findRecord", () => {
        assert.deepEqual(spreadsheet.findRecord.mock.calls[0], [
          "Product",
          "hello-world"
        ]);
      });

      it("returned findRecord return value", async () => {
        assert.deepEqual(result, { id: "hello-world" });
      });
    });

    describe("plural resolver", () => {
      let resolvers;
      beforeEach(async () => {
        spreadsheet = {
          findAll: jest
            .fn()
            .mockReturnValue(
              Promise.resolve([{ id: "hello" }, { id: "world" }])
            )
        };
        resolvers = generateResolvers(schema, spreadsheet);
        result = await resolvers.Query.products({}, {}, {});
      });

      it("invokes spreadsheet.findAll", () => {
        assert.equal(spreadsheet.findAll.mock.calls.length, 1);
      });

      it("passes type to findAll", () => {
        assert.deepEqual(spreadsheet.findAll.mock.calls[0], ["Product"]);
      });

      it("returned findRecord return value", async () => {
        assert.deepEqual(result, [{ id: "hello" }, { id: "world" }]);
      });
    });
  });

  describe("composed resolvers", () => {
    describe("single", () => {
      const schema = buildSchemaFromTypeDefinitions(`
      type Person {
        id: String!
      }

      type Product {
        id: String!
        owner: Person
        creator: Person!
      }

      type Query {
        person(id: String!): Person
      }
    `);
      let result;
      beforeEach(() => {
        result = generateResolvers(schema, {});
      });
      it("creates composed resolvers", () => {
        assert.ok(result.Product.owner);
        assert.ok(result.Product.creator);
      });
      describe("resolver", () => {
        let spreadsheet, ownerResult, creatorResult;
        beforeEach(() => {
          spreadsheet = {
            findRecord: jest
              .fn()
              .mockReturnValueOnce({ id: "taras" })
              .mockReturnValueOnce({ id: "michael" })
          };
          let resolvers = generateResolvers(schema, spreadsheet);
          let root = { owner: "taras", creator: "michael" };
          ownerResult = resolvers.Product.owner(root, {}, {});
          creatorResult = resolvers.Product.creator(root, {}, {});
        });
        it("invokes findRecord", () => {
          assert.equal(spreadsheet.findRecord.mock.calls.length, 2);
          assert.deepEqual(spreadsheet.findRecord.mock.calls[0], [
            "Person",
            "taras"
          ]);
          assert.deepEqual(spreadsheet.findRecord.mock.calls[1], [
            "Person",
            "michael"
          ]);
        });
      });
    });
    describe("lists", () => {
      const schema = buildSchemaFromTypeDefinitions(`
      type Person {
        id: String!
        products: [Product]
      }

      type Product {
        id: String!
      }

      type Query {
        person(id: String!): Person
      }
    `);
      let result;
      beforeEach(() => {
        result = generateResolvers(schema, {});
      });
      it("creates composed resolver", () => {
        assert.ok(result.Person.products);
      });
      describe("resolver", () => {
        let spreadsheet, result;
        beforeEach(() => {
          spreadsheet = {
            findRecords: jest
              .fn()
              .mockReturnValue([
                { id: "iphone" },
                { id: "ipad" },
                { id: "macbook" }
              ])
          };
          let resolvers = generateResolvers(schema, spreadsheet);
          result = resolvers.Person.products(
            { products: "iphone,ipad,macbook" },
            {},
            {}
          );
        });
        it("invokes findRecords", () => {
          assert.equal(spreadsheet.findRecords.mock.calls.length, 1);
          assert.deepEqual(spreadsheet.findRecords.mock.calls[0], [
            "Product",
            ["iphone", "ipad", "macbook"]
          ]);
          assert.deepEqual(result, [
            { id: "iphone" },
            { id: "ipad" },
            { id: "macbook" }
          ]);
        });
      });
    });
  });
  describe("Mutation", () => {
    const typeDefs = `
      type Person {
        id: String!
        firstName: String
        lastName: String
      }

      type Query {
        person: Person
      }
    `;

    describe("createRecordResolver", () => {
      let result;
      const schema = buildSchemaFromTypeDefinitions(`
        ${typeDefs}

        input PersonInput {
          id: String
          firstName: String
          lastName: String
        }

        type Mutation {
          createPerson(person: PersonInput): Person
        }
      `);
      beforeEach(() => {
        result = generateResolvers(schema, {});
      });
      it("generates createPerson mutation", () => {
        assert.ok(result.Mutation.createPerson);
      });
      describe("createRecord", () => {
        let result, spreadsheet;
        beforeEach(() => {
          spreadsheet = {
            newId: jest.fn().mockReturnValue("taras"),
            createRecord: jest.fn()
          };
          let resolvers = generateResolvers(schema, spreadsheet);

          result = resolvers.Mutation.createPerson(
            {},
            {
              person: {
                firstName: "Taras",
                lastName: "Mankovski"
              }
            },
            {}
          );
        });
        it("calls newId when record id is not specified", () => {
          assert.equal(spreadsheet.newId.mock.calls.length, 1);
        });
        it("calls spreadsheet.createRecord", () => {
          assert.equal(spreadsheet.createRecord.mock.calls.length, 1);
          assert.deepEqual(spreadsheet.createRecord.mock.calls[0], [
            "Person",
            {
              firstName: "Taras",
              lastName: "Mankovski",
              id: "taras"
            }
          ]);
        });

        describe("relationship fields", () => {
          let spreadsheet, schema;
          beforeEach(() => {
            schema = buildSchemaFromTypeDefinitions(`
              type Person {
                id: String!
                firstName: String
                lastName: String
                father: Person
                siblings: [Person]
              }

              type Query {
                person: Person
              }

              input PersonInput {
                id: String
              }

              type Mutation {
                createPerson(person: PersonInput): Person
              }
            `);
            spreadsheet = {
              createRecord: jest.fn()
            };
          });
          describe("without relationship data being passed in", () => {
            beforeEach(() => {
              let resolvers = generateResolvers(schema, spreadsheet);
              resolvers.Mutation.createPerson(
                {},
                {
                  person: { id: "taras" }
                }
              );
            });
            it("generates relationship formulas and passes them to createRecod", () => {
              assert.deepEqual(spreadsheet.createRecord.mock.calls[0], [
                "Person",
                {
                  id: "taras",
                  father:
                    "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='taras' AND D='Person' and E='father'\"))",
                  siblings:
                    "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='taras' AND D='Person' and E='siblings'\"))"
                }
              ]);
            });
          });
          describe("with relationship data passed-in", () => {
            let result;
            beforeEach(async () => {
              spreadsheet = {
                newId: jest
                  .fn()
                  .mockReturnValueOnce("taras")
                  .mockReturnValueOnce("serge")
                  .mockReturnValueOnce("lida"),
                createRecord: jest.fn((type, props) => {
                  return Promise.resolve({ ...props });
                })
              };
              let resolvers = generateResolvers(schema, spreadsheet);
              result = await resolvers.Mutation.createPerson(
                {},
                {
                  person: {
                    firstName: "taras",
                    father: {
                      firstName: "serge"
                    },
                    siblings: [{ firstName: "lida" }]
                  }
                },
                {}
              );
            });
            it("returns an object with composed references", () => {
              assert.deepEqual(result, {
                id: "taras",
                firstName: "taras",
                father: {
                  father:
                    "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='serge' AND D='Person' and E='father'\"))",
                  id: "serge",
                  firstName: "serge",
                  siblings:
                    "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='serge' AND D='Person' and E='siblings'\"))"
                },
                siblings: [
                  {
                    firstName: "lida",
                    id: "lida",
                    father:
                      "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='lida' AND D='Person' and E='father'\"))",
                    siblings:
                      "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='lida' AND D='Person' and E='siblings'\"))"
                  }
                ]
              });
            });
            it("writes relationship formulas and not the passed in arguments", () => {
              assert.deepEqual(spreadsheet.createRecord.mock.calls[0], [
                "Person",
                {
                  firstName: "taras",
                  father:
                    "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='taras' AND D='Person' and E='father'\"))",
                  id: "taras",
                  siblings:
                    "=JOIN(\",\", QUERY(RELATIONSHIPS!A:F, \"SELECT F WHERE B='Person' AND C='taras' AND D='Person' and E='siblings'\"))"
                }
              ]);
            });
          });
        });
      });
    });

    describe("updateRecordResolver", () => {
      let result;
      const schema = buildSchemaFromTypeDefinitions(`
        ${typeDefs}

        input PersonInput {
          id: String!
          firstName: String
          lastName: String
        }

        type Mutation {
          updatePerson(person: PersonInput): Person
        }
      `);
      beforeEach(() => {
        result = generateResolvers(schema, {});
      });
      it("generates updatePerson mutation", () => {
        assert.ok(result.Mutation.updatePerson);
      });
      describe("updateRecord", () => {
        let result, spreadsheet;
        beforeEach(() => {
          spreadsheet = {
            updateRecord: jest.fn()
          };
          let resolvers = generateResolvers(schema, spreadsheet);

          result = resolvers.Mutation.updatePerson(
            {},
            {
              person: {
                id: "taras",
                firstName: "Taras",
                lastName: "Mankovski"
              }
            },
            {}
          );
        });
        it("calls spreadsheet.updateRecord", () => {
          assert.equal(spreadsheet.updateRecord.mock.calls.length, 1);
          assert.deepEqual(spreadsheet.updateRecord.mock.calls[0], [
            "Person",
            { id: "taras", firstName: "Taras", lastName: "Mankovski" }
          ]);
        });
      });
    });

    describe("deleteRecordResolver", () => {
      let result;
      const schema = buildSchemaFromTypeDefinitions(`
        ${typeDefs}

        input PersonInput {
          id: String!
          firstName: String
          lastName: String
        }

        type Mutation {
          deletePerson(person: PersonInput): Person
        }
      `);
      beforeEach(() => {
        result = generateResolvers(schema, {});
      });
      it("generates deletePerson mutation", () => {
        assert.ok(result.Mutation.deletePerson);
      });
      describe("deleteRecord", () => {
        let result, spreadsheet;
        beforeEach(() => {
          spreadsheet = {
            deleteRecord: jest.fn()
          };
          let resolvers = generateResolvers(schema, spreadsheet);

          result = resolvers.Mutation.deletePerson(
            {},
            {
              id: "taras"
            },
            {}
          );
        });
        it("calls spreadsheet.deleteRecord", () => {
          assert.equal(spreadsheet.deleteRecord.mock.calls.length, 1);
          assert.deepEqual(spreadsheet.deleteRecord.mock.calls[0], [
            "Person",
            "taras"
          ]);
        });
      });
    });
  });
});