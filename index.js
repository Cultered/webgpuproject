// Globals
var deltaTime = 0;
var prevTime = 0;
const stats = document.getElementById('stats');

async function loadShaderModuleFromFile(device, url) {
    const code = await fetch(url).then(r => r.text());
    return device.createShaderModule({ code });
}
async function getContext() {
    if (!navigator.gpu) {
        console.error("WebGPU API unavailable");
        return;
    }
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
    });
    if (!adapter) {
        throw new Error("No adapter found");
    }
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxBufferSize: 480000000, // Adjust as needed
        }
    });
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: format,
        alphaMode: 'premultiplied',
    });
    return [adapter, device, canvas, context, format];
}

function generateIndexedSphere(lati, long, radius) {
    const vertices = [];
    const indices = [];

    for (let lat = 0; lat <= lati; lat++) {
        const theta = (lat / lati) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= long; lon++) {
            const phi = (lon / long) * 2 * Math.PI;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = radius * sinTheta * cosPhi;
            const y = radius * cosTheta;
            const z = radius * sinTheta * sinPhi;

            vertices.push(x, y, z); // use vec3<f32>
        }
    }

    for (let lat = 0; lat < lati; lat++) {
        for (let lon = 0; lon < long; lon++) {
            const first = lat * (long + 1) + lon;
            const second = first + long + 1;

            indices.push(first, first + 1, second);
            indices.push(second, first + 1, second + 1);
        }
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint32Array(indices),
    };
}

function dTimeUpdate() {
    const currentTime = performance.now();
    deltaTime = (currentTime - prevTime);
    prevTime = currentTime;
    return deltaTime;
}

function getFps() {
    const currentTime = performance.now();
    const fps = 1000 / deltaTime;
    prevTime = currentTime;
    return fps;
}



class Vector3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}
class GameObject {
    constructor() {
        this.position = new Vector3(0, 0, 0);
        this.rotation = new Vector3(0, 0, 0);
        this.props = {};
    }
}
class GameScript {
    constructor(src) {
        this.src = src;
        this.params = {};
    }
    run() {
        this.src(this.params);
    }
}
class Player extends GameObject {
    constructor() {
        super();
    }
}
class Sphere extends GameObject {
    constructor(lat, long, radius) {
        super();
        this.radius = radius;
        this.lat = lat;
        this.long = long;
        console.log("Creating sphere")
        const { vertices, indices } = generateIndexedSphere(lat, long, radius);

        console.log("Sphere created with vertex count: " + vertices.length + " and triangles count: " + indices.length / 3);
        this.props['vertices'] = vertices;
        this.props['indices'] = indices;
    }
}



async function initWebGPU() {

    try {
        const [adapter, device, canvas, context, format] = await getContext()
        const sampleCount = 1;
        canvas.addEventListener("webgpucontextlost", (event) => {
            event.preventDefault();
            console.error("WebGPU context lost! Attempting to recover...");
        });
        let depthTexture = device.createTexture({
            size: { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
            sampleCount,
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        function resizeCanvasAndDepthTexture() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (depthTexture) depthTexture.destroy();
            depthTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                sampleCount,
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }
        window.addEventListener('resize', resizeCanvasAndDepthTexture);
        resizeCanvasAndDepthTexture();
        const clearColor = { r: 0, g: 0, b: 0, a: 1.0 };
        const player = new Player();
        const sphereObject = new Sphere(4000000, 5, 1);


        const shaderModule = await loadShaderModuleFromFile(device, './shader.wgsl');

        vertices = sphereObject.props['vertices'];
        const vertexBuffer = device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);

        indices = sphereObject.props['indices'];
        const indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);

        const uniform0Buffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const uniform1buffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [{
                binding: 0,  // Must match @binding(0) in WGSL
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }
                , {
                binding: 1,  // Must match @binding(1) in WGSL
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }]
        });
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: uniform0Buffer }
            },
            {
                binding: 1,
                resource: { buffer: uniform1buffer }
            }]
        });
        const vertexBuffers = [
            {
                attributes: [
                    {
                        shaderLocation: 0, // position
                        offset: 0,
                        format: "float32x3",
                    }
                ],
                arrayStride: 12,
                stepMode: "vertex",
            },
        ];
        const pipelineDescriptor = {
            vertex: {
                module: shaderModule,
                entryPoint: "vertex_main",
                buffers: vertexBuffers,
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fragment_main",
                targets: [
                    {
                        format: navigator.gpu.getPreferredCanvasFormat(),
                        blend: {
                            color: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "back",
            },

            layout: device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            multisample: {
                count: sampleCount, // 4x MSAA
            },
            depthStencil: {
                format: 'depth24plus', // or 'depth32float'
                depthWriteEnabled: true,
                depthCompare: 'less',  // Common default
            },
        };
        const renderPipeline = device.createRenderPipeline(pipelineDescriptor);

        function updateStats() {
            stats.innerText = `FPS: ${getFps().toFixed(0)} Vertices: ${(vertices.length).toLocaleString()}`;
            setTimeout(updateStats, 1000); // Update stats every sec
        }
        updateStats();
        // Update frame and stuff
        async function update() {
            dTimeUpdate();
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            sphereObject.rotation.x += 0.001 * deltaTime;
            sphereObject.rotation.y += 0.001 * deltaTime;
            const binding0uniform = new Float32Array([
                canvas.width,
                canvas.height,
                0,
                0
            ]);
            const binding1uniform = new Float32Array([
                sphereObject.position.x,
                sphereObject.position.y,
                sphereObject.position.z,
                0, //padding for 16 byte align
                sphereObject.rotation.x,
                sphereObject.rotation.y,
                sphereObject.rotation.z,
                0, //padding
            ]);


            device.queue.writeBuffer(uniform0Buffer, 0, binding0uniform);
            device.queue.writeBuffer(uniform1buffer, 0, binding1uniform);


            const renderPassDescriptor = {
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    //resolveTarget: context.getCurrentTexture().createView(),
                    clearValue: clearColor,
                    loadOp: "clear",
                    storeOp: "store",
                }],
                depthStencilAttachment: {
                    view: depthTexture.createView(),
                    depthLoadOp: 'clear',
                    depthClearValue: 1.0,
                    depthStoreOp: 'store',
                },
            };

            const commandEncoder = device.createCommandEncoder();
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            passEncoder.setPipeline(renderPipeline);
            passEncoder.setVertexBuffer(0, vertexBuffer);
            passEncoder.setIndexBuffer(indexBuffer, "uint32"); // Or "uint16" if using Uint16Array


            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.drawIndexed(indices.length);

            passEncoder.end();

            device.queue.submit([commandEncoder.finish()]);
            requestAnimationFrame(update);
        }
        update();

    } catch (error) {
        console.error("WebGPU initialization failed:", error);
        document.getElementById('webgpu-instructions').style.display = 'block';
    }
}
initWebGPU()