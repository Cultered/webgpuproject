async function loadShaderModuleFromFile(device, url) {
    const code = await fetch(url).then(r => r.text());
    return device.createShaderModule({ code });
}
async function getContext() {
    if (!navigator.gpu) {
        console.error("WebGPU API unavailable");
        return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No adapter found");
    }
    const device = await adapter.requestDevice();
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

async function sphere(lat, long, radius) {
    const verticesArray = [];
    const latitudeBands = lat;
    const longitudeBands = long;
    // Generate sphere vertices (triangle list)
    for (let lat = 0; lat < latitudeBands; lat++) {
        const theta1 = (lat / latitudeBands) * Math.PI;
        const theta2 = ((lat + 1) / latitudeBands) * Math.PI;

        for (let lon = 0; lon < longitudeBands; lon++) {
            const phi1 = (lon / longitudeBands) * 2 * Math.PI;
            const phi2 = ((lon + 1) / longitudeBands) * 2 * Math.PI;

            // Four points of the quad
            const p1 = [
                radius * Math.sin(theta1) * Math.cos(phi1),
                radius * Math.cos(theta1),
                radius * Math.sin(theta1) * Math.sin(phi1),
                1
            ];
            const p2 = [
                radius * Math.sin(theta2) * Math.cos(phi1),
                radius * Math.cos(theta2),
                radius * Math.sin(theta2) * Math.sin(phi1),
                1
            ];
            const p3 = [
                radius * Math.sin(theta2) * Math.cos(phi2),
                radius * Math.cos(theta2),
                radius * Math.sin(theta2) * Math.sin(phi2),
                1
            ];
            const p4 = [
                radius * Math.sin(theta1) * Math.cos(phi2),
                radius * Math.cos(theta1),
                radius * Math.sin(theta1) * Math.sin(phi2),
                1
            ];

            // Assign a unique color per quad based on lat/lon

            const color1 = [
                (lat) / latitudeBands,
                (lon) / longitudeBands,
                1.0 - (lat) / latitudeBands,
                1
            ]; const color2 = [
                (lat + 1) / latitudeBands,
                (lon) / longitudeBands,
                1.0 - (lat + 1) / latitudeBands,
                1
            ]; const color3 = [
                (lat + 1) / latitudeBands,
                (lon + 1) / longitudeBands,
                1.0 - (lat + 1) / latitudeBands,
                1
            ]; const color4 = [
                (lat) / latitudeBands,
                (lon + 1) / longitudeBands,
                1.0 - (lat) / latitudeBands,
                1
            ];

            // First triangle
            verticesArray.push(...p1, ...color1);
            verticesArray.push(...p2, ...color2);
            verticesArray.push(...p3, ...color3);

            // Second triangle
            verticesArray.push(...p1, ...color1);
            verticesArray.push(...p3, ...color3);
            verticesArray.push(...p4, ...color4);
        }
    }
    return verticesArray;
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
    }
}
async function initWebGPU() {

    try {
        const [_, device, canvas, context, format] = await getContext()
        canvas.addEventListener("webgpucontextlost", (event) => {
            event.preventDefault();
            console.error("WebGPU context lost! Attempting to recover...");
        });

        const verticesArray = await sphere(30, 5, 1)
        const clearColor = { r: 1, g: 1, b: 1, a: 1.0 };
        const sampleCount = 1;
        const player = new Player();
        const sphereObject = new Sphere(1, 30, 5);
        sphereObject.props['vertices'] = verticesArray;
        const vertices = new Float32Array(sphereObject.props['vertices']);
        const shaderModule = await loadShaderModuleFromFile(device, './shader.wgsl');
        const vertexBuffer = device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        const uniform0Buffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const uniform1buffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const vertexBuffers = [
            {
                attributes: [
                    {
                        shaderLocation: 0, // position
                        offset: 0,
                        format: "float32x4",
                    },
                    {
                        shaderLocation: 1, // color
                        offset: 16,
                        format: "float32x4",
                    },
                ],
                arrayStride: 32,
                stepMode: "vertex",
            },
        ];
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
        async function update() {

            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            sphereObject.rotation.y += 0.01;
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
            device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);

            const depthTexture = device.createTexture({
                size: { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
                sampleCount,
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
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
            passEncoder.setBindGroup(0, bindGroup);

            passEncoder.draw(vertices.length / 8);
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
