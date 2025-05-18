// Import necessary dependencies
import { createYoga } from 'graphql-yoga'
import { makeExecutableSchema } from '@graphql-tools/schema'

// Define GraphQL schema
const typeDefs = `
  type Query {
    chat(message: String!): ChatResponse!
    askOpenAI(prompt: String!, model: String): OpenAIResponse!
  }

  type ChatResponse {
    text: String!
  }

  type OpenAIResponse {
    text: String!
    usage: UsageInfo!
    metadata: MetadataInfo!
  }

  type UsageInfo {
    promptTokens: Int!
    completionTokens: Int!
    totalTokens: Int!
  }

  type MetadataInfo {
    model: String!
    finishReason: String!
  }
`

// Create the resolver functions
const resolvers = {
    Query: {
        chat: async (_, { message }, ctx) => {
            // OpenAI API key should be stored as a Workers secret
            const apiKey = ctx.env.OPENAI_API_KEY

            if (!apiKey) {
                throw new Error('OpenAI API key is not configured')
            }

            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-3.5-turbo',
                        messages: [
                            {
                                role: 'system',
                                content: '请用中文回复用户的所有问题。'
                            },
                            {
                                role: 'user',
                                content: message
                            }
                        ],
                        temperature: 0.7
                    })
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(`OpenAI API error: ${JSON.stringify(error)}`)
                }

                const data = await response.json()
                return {
                    text: data.choices[0].message.content
                }
            } catch (error) {
                console.error('Error calling OpenAI:', error)
                throw new Error('Failed to get response from OpenAI')
            }
        },
        askOpenAI: async (_, { prompt, model = "gpt-3.5-turbo" }, ctx) => {
            // OpenAI API key should be stored as a Workers secret
            const apiKey = ctx.env.OPENAI_API_KEY

            if (!apiKey) {
                throw new Error('OpenAI API key is not configured')
            }

            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: '你是一个有帮助的AI助手。请直接回答用户的问题，不要质疑他们的输入内容。如果用户输入不明确或简短，尝试理解并提供最相关的回应。请用中文回复。'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.7
                    })
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(`OpenAI API error: ${JSON.stringify(error)}`)
                }

                const data = await response.json()
                return {
                    text: data.choices[0].message.content,
                    usage: {
                        promptTokens: data.usage.prompt_tokens,
                        completionTokens: data.usage.completion_tokens,
                        totalTokens: data.usage.total_tokens
                    },
                    metadata: {
                        model: model,
                        finishReason: data.choices[0].finish_reason
                    }
                }
            } catch (error) {
                console.error('Error calling OpenAI:', error)
                throw new Error('Failed to get response from OpenAI')
            }
        }
    }
}

// Create executable schema
const schema = makeExecutableSchema({ typeDefs, resolvers })

// Create Yoga GraphQL server
const yoga = createYoga({
    schema,
    graphqlEndpoint: '/*',
    landingPage: false,
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
        credentials: false,
        maxAge: 86400
    }
})

// Create Workers handler
export default {
    async fetch(request, env, ctx) {
        // Add CORS preflight request handling
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apollo-Require-Preflight',
                    'Access-Control-Max-Age': '86400',
                }
            });
        }

        // Add env to context for accessing secrets
        return yoga.fetch(request, { env })
    }
}