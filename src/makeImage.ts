import { grpc } from "@improbable-eng/grpc-web";
import adjectives from "./adjectives.json";
import adverbs from "./adverbs.json";
import animals from "./animals.json";
import circleBinary from "./circle.json";
import { FetchReadableStreamTransport } from "./fetch";
import nouns from "./nouns.json";
import Generation from "./stable-diffusion/generation_pb";
import GenerationService from "./stable-diffusion/generation_pb_service";

const ADJECTIVE_COUNT = 1109;
const ADVERB_COUNT = 324;
const NOUN_COUNT = 939;
const ANIMAL_COUNT = 224;

const makeWords = (node: string) => {
  const adjectiveIndex = parseInt(node.slice(2, 14), 16) % ADJECTIVE_COUNT;
  const adverbIndex = parseInt(node.slice(14, 26), 16) % ADVERB_COUNT;
  const nounIndex = parseInt(node.slice(26, 38), 16) % NOUN_COUNT;
  const animalIndex = parseInt(node.slice(38, 50), 16) % ANIMAL_COUNT;

  return {
    adjective: adjectives[adjectiveIndex],
    adverb: adverbs[adverbIndex],
    noun: nouns[nounIndex],
    animal: animals[animalIndex],
  };
};

const makeImage = async (node: string, apiKey: string) => {
  const imageParams = new Generation.ImageParameters();
  imageParams.setWidth(512);
  imageParams.setHeight(512);
  imageParams.addSeed(parseInt(node.slice(62, 66), 16));
  imageParams.setSamples(1);
  imageParams.setSteps(30);

  const transformType = new Generation.TransformType();
  transformType.setDiffusion(Generation.DiffusionSampler.SAMPLER_K_DPMPP_2M);
  imageParams.setTransform(transformType);

  const request = new Generation.Request();
  request.setEngineId("stable-diffusion-512-v2-1");
  request.setRequestedType(Generation.ArtifactType.ARTIFACT_IMAGE);
  request.setClassifier(new Generation.ClassifierParameters());

  const samplerParams = new Generation.SamplerParameters();
  samplerParams.setCfgScale(12);

  const stepParams = new Generation.StepParameter();
  const scheduleParams = new Generation.ScheduleParameters();
  scheduleParams.setStart(0.85);

  stepParams.setScaledStep(0);
  stepParams.setSampler(samplerParams);
  stepParams.setSchedule(scheduleParams);

  imageParams.addParameters(stepParams);
  request.setImage(imageParams);

  const promptImage = new Generation.Prompt();
  const promptImageParams = new Generation.PromptParameters();
  promptImageParams.setInit(true);
  promptImage.setParameters(promptImageParams);
  const artifact = new Generation.Artifact();
  artifact.setType(Generation.ArtifactType.ARTIFACT_IMAGE);
  artifact.setBinary(Uint8Array.from(circleBinary));
  artifact.setMime("image/png");
  artifact.setMagic("PNG");
  promptImage.setArtifact(artifact);
  request.addPrompt(promptImage);

  const { adjective, adverb, noun, animal } = makeWords(node);
  const makePromptText = (prompt: string, weight: number = 1) => {
    const promptText = new Generation.Prompt();
    const promptParams = new Generation.PromptParameters();
    promptText.setText(prompt);
    promptParams.setWeight(weight);
    promptText.setParameters(promptParams);
    request.addPrompt(promptText);
    console.log(prompt, promptParams.getWeight());
  };
  makePromptText(
    `A simple vector icon of a portrait of a ${animal}, head centered in frame`
  );
  makePromptText(`described as ${adverb} ${adjective} ${noun}`, 0.25);
  makePromptText(
    `profile picture, twitter avatar, instagram avatar, Ethereum NFT`
  );
  makePromptText(
    `3D, instagram logo, twitter logo, ugly, new to this, saturated, facing camera, grey background, alamy, stock photo, JPEG compression, dull, boring, low contrast`,
    -2
  );
  makePromptText(
    `watermark, blurry, monochrome, bordered, framed, human, low poly, striped background, long shadow`,
    -5
  );

  const metadata = new grpc.Metadata();
  metadata.set("Authorization", "Bearer " + apiKey);

  const generationClient = new GenerationService.GenerationServiceClient(
    "https://grpc.stability.ai",
    {
      transport: FetchReadableStreamTransport({}),
    }
  );

  const returnGenerate = () =>
    new Promise<Uint8Array>((resolve, reject) => {
      const generation = generationClient.generate(request, metadata);

      // Set up a callback to handle data being returned
      generation.on("data", (data) => {
        data.getArtifactsList().forEach((artifact) => {
          // Oh no! We were filtered by the NSFW classifier!
          console.log(artifact.getFinishReason());
          if (artifact.getFinishReason() === Generation.FinishReason.FILTER) {
            // if NSFW filter is triggered, try again with a different seed
            imageParams.addSeed(1);
            return resolve(returnGenerate());
          }

          // Make sure we have an image
          if (artifact.getType() !== Generation.ArtifactType.ARTIFACT_IMAGE)
            return reject("No image was returned.");

          resolve(artifact.getBinary_asU8());
        });
      });

      // Anything other than `status.code === 0` is an error
      generation.on("status", (status) => {
        if (status.code === 0) return;
        console.log(status);
        reject(
          "Your image could not be generated. You might not have enough credits."
        );
      });
    });

  return returnGenerate();
};

export default makeImage;
