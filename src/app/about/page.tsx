import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About - D&D Session Recorder',
  description: 'Learn about the D&D Session Recorder and how it helps you manage your campaign sessions.',
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">About D&D Session Recorder</h1>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">What is this for?</h2>
        <div className="prose prose-gray max-w-none">
          <p className="mb-4">
            The D&D Chronicles is a tool, primarly for Dungeon Masters, to help with keeping track of
            their campaigns and sessions. It can be difficuly to both run the game and take notes, and with so many games
            taking place online it is often easy to create a recording of the game session. Rather than have the DM spend time
            manually going over the recording, or stopping the game to take notes, they can simply use this tool to fetch all the relevant info.
          </p>
          <p className="mb-4">
            With a session recorded, you can upload it to the appropriate campaign, the tool will transcibe the audio and generate a summary of the session.
            You as the DM can provide additional context, like specific names, tone, and setting notes to help the summary be more relevant.
            You can also generate a to-do list, having the text of the transcript fed in to an AI to look for any things mentioed in the session, or loose threads that you might want to keep in mind.
          </p>
          <p className="mb-4">
            In addition to the basic campaign and session setup. There are plans to add more DM management features, like building our character chronicles, so you can quickly see how each character is progressing in their personal quests, or important events for them.
            Adding overatching plot trackers, so you can remember all the threads you have put out there and when the players inteact with them.
            Add session search and interaction. Trying to remember a specific event? Just search through your past sessions to find exactly what happened.
            Finally, the technology is there to support streaming, both streaming from somethig like discord and to the session transcription, allowing real time transcription and effortless tracking.
          </p>
        </div>
      </section>

      {/* How does it work */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">How does it work?</h2>
        <div className="prose prose-gray max-w-none">
          <ol className="list-decimal list-inside space-y-4">
            <li>
              <strong>Create an Account</strong> - You can create an account using your email or by linking your Google account.
            </li>
            <li>
              <strong>Create Campaigns</strong> - You can create as many campaigns as you wish, providing a name, summary, and an optional prompt tuning, to help the transcription and summay.
            </li>
            <li>
              <strong>Upload Session Audio</strong> - Record your game session and upload the audio. Currently we only support files up to 100MB, and I highly encourage compressed mp3 files.
            </li>
            <li>
              <strong>Automatic Processing</strong> - With that in place, a transcription is started. Currently we use the Whipser V2 model as hosted by OpenAI.
            </li>
            <li>
              <strong>Generate A Summary</strong> - Once the audio is transcribed, a summary is generated. This currently uses gpt-4o.
            </li>
            <li>
              <strong>Generate a to-do list</strong> - You can also generate a to-do list, this also uses gpt-4o.
            </li>
            <li>
              <strong>Edit if Needed</strong> - While transcriptions are pretty accurate, often names and other proper nouns are not spelled correctly, evne with some light prompting. You can fix these manually if needed.
            </li>
          </ol>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="space-y-6">

          <div>
            <h3 className="text-lg font-semibold mb-2">How long does transcription take?</h3>
            <p className="text-gray-700">
              Transcription time is depending on session length. Currently Whipser only can handle 10 minutes of audio, so the trancription will split the audio and transcribe each chunk.
              This can take a few minutes per chunk. The session page will show the progress of the transcription.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">What happens to my audio files?</h3>
            <p className="text-gray-700">
              Once the transcription is done, the audio file is deleted. If the automatic deletion fails, you can manually delete the file from your uploads page.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Is my audio or text used to train AI systems or stored on any other servers?</h3>
            <p className="text-gray-700">
              <p>The answers are slightly different between the two main endpoints. For transcription the answer is &#39;No&#39;. full stop. The OpenAI audio transcription endpoints do not retain any data, nor do they train on any data.</p>
              <p>The text endpoints do not train on any data, but they do retain data for up to 30 days for Abuse Monitoring. There is an option to apply for Zero Retention Polciies, but at this time, I do not have the volume of requests to justify it.</p>
              <p>For further details you can read the OpenAI documentation on the topic: <a className="text-blue-500 hover:text-blue-700 underline" href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noopener noreferrer">Your Data</a>.</p>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
