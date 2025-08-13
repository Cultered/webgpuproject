
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
};
struct ViewUniforms {
    width: f32,
    height: f32,
};
struct ObjectUniform{
    position: vec4f,
    rotation: vec4f,
};

@group(0) @binding(0) // Use next available binding slot
var<uniform> view: ViewUniforms;
@group(0) @binding(1) // Use next available binding slot
var<uniform> object: ObjectUniform;

fn perspectiveProjection(pos: vec4f, fovY: f32, aspect: f32, near: f32, far: f32) -> vec4f {
    let f = 1.0 / tan(radians(fovY) * 0.5);
    let nf = 1.0 / (near - far);
    let proj = mat4x4<f32>(
        vec4<f32>(f / aspect, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, f, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, (far + near) * nf, -1.0),
        vec4<f32>(0.0, 0.0, (2.0 * far * near) * nf, 0.0)
    );
    return proj * pos;
}


@vertex
fn vertex_main(@location(0) position: vec4f,
    @location(1) color: vec4f) -> VertexOut {
    var output: VertexOut;
    var aspect = view.width / view.height;
    var near = 0.1;
    var far = 100000.;

    var cameraPosition = vec4f(0.0, 0.0, 2.0, 0.0);


    // Apply a rotation around the Y axis
    let cameraRotation = radians(0.0);
    

    let rotatedPosition = rotationalMatrix(object.rotation) * position;
    let worldPosition = rotatedPosition + object.position;
    let relativePosition = worldPosition - cameraPosition;
    let rotatedPlayerPosition = rotationalMatrix(vec4f(0.,radians(0.),0.,0.)) * relativePosition;
    output.position = perspectiveProjection(rotatedPlayerPosition, 90., aspect, near, far);
    output.color = color;
    return output;
}

fn rotationalMatrix(angle: vec4f) -> mat4x4<f32> {
    let cosX = cos(angle.x);
    let sinX = sin(angle.x);
    let cosY = cos(angle.y);
    let sinY = sin(angle.y);
    let cosZ = cos(angle.z);
    let sinZ = sin(angle.z);

    return mat4x4<f32>(
        vec4<f32>(cosY * cosZ, -cosY * sinZ, sinY, 0.0),
        vec4<f32>(sinX * sinY * cosZ + cosX * sinZ, -sinX * sinY * sinZ + cosX * cosZ, -sinX * cosY, 0.0),
        vec4<f32>(-cosX * sinY * cosZ + sinX * sinZ, cosX * sinY * sinZ + sinX * cosZ, cosX * cosY, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}

fn random(st: vec4f) -> f32 {
    return fract(sin(dot(st.xyzw,
        vec4(12.9898, 78.233, 352.321, 98.32))) * 43758.5453123);
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    var x = fragData.position.x / view.width;
    var y = fragData.position.y / view.height;
    var z = 0.;
    var w = 1.;
    return fragData.color;
}