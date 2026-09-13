import EnvironmentShader from "./scene/EnvironmentShader";

// Only environmental motion lives here: ocean displacement, iceberg
// shimmer, and lightning (all inside EnvironmentShader). No particle
// system — removed entirely rather than conditionally hidden.
export default function Scene() {
  return <EnvironmentShader />;
}
