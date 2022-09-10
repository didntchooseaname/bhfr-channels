import {
    ChannelType,
    Client,
    GatewayIntentBits,
    GuildMember,
    Message,
    PermissionFlagsBits,
    VoiceBasedChannel,
    User,
    EmbedBuilder,
    VoiceState,
    Channel,
    TextChannel,
    VoiceChannel,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageActionRowComponentBuilder,
} from "discord.js"
import { config as loadEnv } from "dotenv"

loadEnv()

const CATEGORY_PREFIX = "🎮 "
const GEN_CHANNEL_PREFIX = "➕ "
const VOICE_CHANNEL_PREFIX = "🎮 "
const MOMENT_EMOJI = "⭐"

const {
    DISCORD_TOKEN = "",
    ADD_MOMENTS_ROLES_IDS = "",
    MOMENTS_CHANNEL_ID = "",
    VOICE_LOGS_CHANNEL_ID = "",
    VOICE_CHANNELS_RULES_ROLE_ID = "",
    SUPPORT_CHANNEL_ID = "",
    RULES_CHANNEL_ID = "",
} = process.env

const ACCEPT_VOICE_CHAT_RULES_CUSTOM_ID = "accept_voice_chat_rules"

const addMomentsRoleIds = ADD_MOMENTS_ROLES_IDS.split(",")

const isMemberAdmin = (member?: GuildMember): member is GuildMember =>
    !!member?.permissions.has(PermissionFlagsBits.Administrator)

const canAddMoment = (member?: GuildMember): member is GuildMember =>
    !!member && addMomentsRoleIds.some((id) => member.roles.cache.has(id))

const hasAcceptedVoiceChatRules = (member: GuildMember | null) =>
    !VOICE_CHANNELS_RULES_ROLE_ID ||
    !member ||
    member.roles.cache.has(VOICE_CHANNELS_RULES_ROLE_ID)

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ],
})

const log = (message: string) => {
    console.log(message)
}

const newLine = () => console.log()

const isTextChannel = (channel?: Channel): channel is TextChannel =>
    !!channel && channel.type === ChannelType.GuildText

const getMomentsChannel = () => {
    const channel = client.channels.cache.get(MOMENTS_CHANNEL_ID)
    if (!isTextChannel(channel)) return null
    return channel
}

const getVoiceLogsChannel = () => {
    const channel = client.channels.cache.get(VOICE_LOGS_CHANNEL_ID)
    if (!isTextChannel(channel)) return null
    return channel
}

const saveMoment = async (message: Message, user: User) => {
    const channel = getMomentsChannel()
    if (!channel) return

    let hasContent = false

    const embed = new EmbedBuilder()
        .setAuthor({
            name: message.author.tag,
            iconURL: message.author.displayAvatarURL(),
            url: message.url,
        })
        .setDescription(
            `Ajouté le ${Intl.DateTimeFormat("fr").format(message.createdAt)}`,
        )
        .setFooter({
            text: `Ajouté par ${user.username} le ${Intl.DateTimeFormat(
                "fr",
            ).format(new Date())}`,
            iconURL: user.displayAvatarURL(),
        })

    if (message.content) {
        hasContent = true
        embed.addFields({
            name: "Message",
            value: message.content,
            inline: false,
        })
    }

    if (message.attachments.size > 0) {
        hasContent = true
        embed.setImage(message.attachments.first()?.url ?? null)
    }

    if (!hasContent) return

    log(`${MOMENT_EMOJI} Logging moment in ${channel.name}`)
    newLine()

    await channel.send({ embeds: [embed] })
}

const isGeneratorChannel = (
    channel: VoiceBasedChannel | null,
): channel is VoiceChannel =>
    !!channel &&
    channel.name.startsWith(GEN_CHANNEL_PREFIX) &&
    !!channel.parent?.name.startsWith(CATEGORY_PREFIX)

const isVoiceChannel = (
    channel: VoiceBasedChannel | null,
): channel is VoiceChannel =>
    !!channel &&
    channel.name.startsWith(VOICE_CHANNEL_PREFIX) &&
    !!channel.parent?.name.startsWith(CATEGORY_PREFIX)

const deleteChannelIfEmpty = async (voiceState: VoiceState) => {
    const channel = voiceState.channel

    if (!isVoiceChannel(channel)) return

    const voiceLogsChannel = getVoiceLogsChannel()

    log(
        "╭ " +
        `${voiceState.member?.user.tag} (${voiceState.member?.user.id}) has left [${channel.name}]`,
    )
    const embed = new EmbedBuilder() //
        .setTitle(channel.name)
        .addFields({
            name: "Événement",
            value: `${voiceState.member?.user} (${voiceState.member?.user.id}) a quitté le salon`,
        })
        .setTimestamp(new Date())

    if (channel.members.size > 0) {
        log(
            "╰ " +
            `  ${channel.members.size}/${channel.userLimit} users in channel`,
        )
        newLine()

        embed //
            .setColor("Orange")
            .setDescription(
                `${channel.members.size}/${channel.userLimit} joueurs restants`,
            )
            .addFields({
                name: "Joueurs",
                value: channel.members
                    .map((member) => `${member.user} (${member.user.id})`)
                    .join("\n"),
            })

        if (!!voiceLogsChannel) {
            voiceLogsChannel.send({ embeds: [embed] })
        }

        channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("Orange")
                    .setTitle(`${voiceState.member?.user.tag} a quitté le salon`)
                    .setDescription(`id: ${voiceState.member?.user.id}`)
                    .setTimestamp(new Date()),
            ],
        })

        return
    }

    log("╰ " + `  No users in channel => Deleting channel`)
    newLine()

    await channel.delete()

    embed //
        .setDescription(`Aucun joueur restant, suppression du salon`)
        .setColor("Red")

    if (!!voiceLogsChannel) {
        voiceLogsChannel.send({ embeds: [embed] })
    }
}

const cloneGeneratorChannel = async (voiceState: VoiceState) => {
    const channel = voiceState.channel

    if (!isGeneratorChannel(channel)) return null

    if (!channel.parent) return null

    const voiceLogsChannel = getVoiceLogsChannel()

    const newChannelName = channel.name.slice(GEN_CHANNEL_PREFIX.length)

    const genChannel = await channel.clone({
        name: `${VOICE_CHANNEL_PREFIX}${newChannelName}`,
        parent: channel.parent,
        position: 999,
    })

    log(
        `${voiceState.member?.user.tag} (${voiceState.member?.user.id}) has created [${channel.name}]`,
    )
    newLine()

    if (!!voiceLogsChannel) {
        const embed = new EmbedBuilder() //
            .setTitle(channel.name)
            .addFields({
                name: "Événement",
                value: `${voiceState.member?.user} (${voiceState.member?.user.id}) a créé le salon ${genChannel.name}`,
            })
            .setTimestamp(new Date())
            .setColor("Blue")
        voiceLogsChannel.send({ embeds: [embed] })
    }

    return genChannel
}

const logUserJoinedVoiceChannel = async (voiceState: VoiceState) => {
    const channel = voiceState.channel

    if (!isVoiceChannel(channel)) return

    if (!hasAcceptedVoiceChatRules(voiceState.member)) {
        channel.send({
            content: `Salut ${voiceState.member?.user} ! C'est peut être la première fois que tu crées ou rejoins un salon vocal, merci de lire et d'accepter les règles suivantes:`,
            embeds: [
                new EmbedBuilder()
                    .setColor("White")
                    .setTitle("Règles des salons vocaux")
                    .addFields(
                        {
                            name: "Règles générales",
                            value: `:straight_ruler: Les règles générales du serveur s'appliquent également dans les salons vocaux.\n*Lisez les attentivement et respectez-les: <#${RULES_CHANNEL_ID}>.*`,
                        },
                        {
                            name: "Modération",
                            value: `:warning: Les modérateurs peuvent voir qui est rentré et sorti du salon.\n:octagonal_sign: Si quelqu\'un ne respecte pas les règles (toxicité, insultes, etc.), merci d'ouvrir un ticket dans <#${SUPPORT_CHANNEL_ID}> **AVEC UNE PREUVE** (vidéo de préférence).`,
                        },
                        {
                            name: "Rooms Brawlhalla",
                            value: `:ledger: Merci d'envoyer le **numéro de room actuel** dans le salon textuel associé à votre vocal.\n:handshake: Cela permet aux autres joueurs de vous rejoindre plus facilement.\n*N'oubliez pas de le renvoyer à chaque fois que vous changez de room!*`,
                        },
                    ),
            ],
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(ACCEPT_VOICE_CHAT_RULES_CUSTOM_ID)
                        .setEmoji("✅")
                        .setLabel("Accepter")
                        .setStyle(ButtonStyle.Secondary),
                ),
            ],
        })
    }

    channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor("Green")
                .setTitle(`${voiceState.member?.user.tag} a rejoint le salon`)
                .setDescription(`id: ${voiceState.member?.user.id}`)
                .setTimestamp(new Date()),
        ],
    })

    log(
        "╭ " +
        `${voiceState.member?.user.tag} (${voiceState.member?.user.id}) has joined [${channel.name}]`,
    )
    log(
        "╰ " +
        `  ${channel.members.size}/${channel.userLimit} users in channel`,
    )
    newLine()

    const voiceLogsChannel = getVoiceLogsChannel()

    if (!!voiceLogsChannel) {
        const embed = new EmbedBuilder() //
            .setTitle(channel.name)
            .setDescription(
                `${channel.members.size}/${channel.userLimit} joueurs`,
            )
            .addFields(
                {
                    name: "Événement",
                    value: `${voiceState.member?.user} (${voiceState.member?.user.id}) a rejoint le salon`,
                },
                {
                    name: "Joueurs",
                    value: channel.members
                        .map((member) => `${member.user} (${member.user.id})`)
                        .join("\n"),
                },
            )
            .setTimestamp(new Date())
            .setColor("Green")
        voiceLogsChannel.send({ embeds: [embed] })
    }
}

client.on("voiceStateUpdate", async (oldState, newState) => {
    if (oldState.channel?.id === newState.channel?.id) return

    await deleteChannelIfEmpty(oldState)
    await logUserJoinedVoiceChannel(newState)
    await cloneGeneratorChannel(newState).then(async (channel) => {
        if (!channel) return
        newState.member?.voice.setChannel(channel)
    })
})

type RawReactionEventData = {
    user_id: string
    message_id: string
    emoji: { name: string; id: null }
    channel_id: string
    guild_id: string
}

const isReactionAddEvent = (
    event: any,
): event is object & { t: "MESSAGE_REACTION_ADD" } =>
    event.t === "MESSAGE_REACTION_ADD"

client.on("raw", async (event: { d: RawReactionEventData; t: string }) => {
    if (!isReactionAddEvent(event)) return

    const { d: data } = event
    const user = await client.users.fetch(data.user_id)

    if (!user || user.bot) return

    const channel = client.channels.cache.get(data.channel_id)
    if (!channel || channel.type !== ChannelType.GuildText) return

    if (channel.messages.cache.has(data.message_id)) return

    const message = await channel.messages.fetch(data.message_id)

    if (!message) return

    log(`${user.tag} (${user.id}) reacted with ${data.emoji.name}`)
    newLine()

    if (data.emoji.name !== MOMENT_EMOJI) return

    const member = message.guild?.members.cache.get(user.id)

    if (!isMemberAdmin(member) && !canAddMoment(member)) return

    try {
        await saveMoment(message, user)
    } catch (e) {
        console.error(e)
    }
})

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return

    if (interaction.customId !== ACCEPT_VOICE_CHAT_RULES_CUSTOM_ID) return
    const member = interaction.member as GuildMember

    if (!member) return

    if (!interaction.message.mentions.has(member.user)) {
        interaction.reply({
            content: `Vous n'êtes pas concerné par ce message.`,
            ephemeral: true,
        })
        return
    }

    if (hasAcceptedVoiceChatRules(member)) return

    await member.roles.add(VOICE_CHANNELS_RULES_ROLE_ID)

    await interaction.reply({
        content: `Merci ${member.user} ! Bon jeu !`,
        ephemeral: true,
    })


    interaction.message.delete()
})

client.on("ready", () => {
    log(`Logged in as ${client.user?.tag}!`)
    newLine()
})

client.login(DISCORD_TOKEN)
