import path from 'path'
import fs from 'fs-extra'
import { readJSONSync } from '../utils/filesystem'
import { copySample, Project } from './Project'
import { sdk } from '@dcl/schemas'
import installDependencies from '../project/installDependencies'

interface WorkspaceProjectSchema {
  name?: string
  path: string
}

interface WorkspaceFileSchema {
  folders: WorkspaceProjectSchema[]
}

export const workspaceConfigFile = 'dcl-workspace.json'

function getWorkspaceJsonWithFolders(workspaceJsonPath: string): {
  json?: WorkspaceFileSchema
  resolvedFolders: string[]
} {
  const workspaceJsonDir = path.dirname(workspaceJsonPath)
  if (fs.existsSync(workspaceJsonPath)) {
    try {
      const workspaceJson = readJSONSync<WorkspaceFileSchema>(workspaceJsonPath)
      if (workspaceJson.folders) {
        const resolvedFolders = workspaceJson.folders.map((folderPath) =>
          path.resolve(
            folderPath.path.startsWith('/') || folderPath.path.startsWith('\\')
              ? folderPath.path
              : `${workspaceJsonDir}/${folderPath.path}`
          )
        )
        return { json: workspaceJson, resolvedFolders }
      }
    } catch (err) {
      console.error(err)
    }
  }
  return { resolvedFolders: [] }
}

export interface Workspace {
  getAllProjects: () => Project[]
  getProject: (index: number) => Project
  getSingleProject: () => Project | null
  isSingleProject: () => boolean
  hasPortableExperience: () => boolean
  getBaseCoords: () => Promise<{ x: number; y: number }>
  addProject: (projectPath: string) => Promise<void>
}

export const createWorkspace = ({
  workingDir,
  workspaceFilePath
}: {
  workingDir?: string
  workspaceFilePath?: string
}): Workspace => {
  const projects: Project[] = []

  const workspaceJsonPath =
    workspaceFilePath ||
    path.resolve(workingDir || '', workspaceConfigFile) ||
    ''

  if (workspaceJsonPath === '') {
    throw new Error(`Couldn't find the workspace file or a working directory.`)
  }

  const workspaceInfo = getWorkspaceJsonWithFolders(workspaceJsonPath)
  if (workspaceInfo.resolvedFolders.length) {
    for (const projectFolder of workspaceInfo.resolvedFolders) {
      projects.push(new Project(projectFolder))
    }
  } else if (workingDir) {
    projects.push(new Project(workingDir))
  }

  if (projects.length === 0) {
    throw new Error(
      'At least one project has to have been read for the workspace.'
    )
  }
  const getAllProjects = () => {
    return projects
  }

  const getProject = (index: number = 0) => {
    return projects[index]
  }

  const isSingleProject = () => {
    return (
      projects.length === 1 && projects[0].getProjectWorkingDir() === workingDir
    )
  }

  const getSingleProject = (): Project | null => {
    return (isSingleProject() && projects[0]) || null
  }

  const hasPortableExperience = () => {
    return !!projects.find(
      (project) =>
        project.getInfo().sceneType === sdk.ProjectType.PORTABLE_EXPERIENCE
    )
  }

  const getBaseCoords = async () => {
    const firstParcelScene = projects.find(
      (project) => project.getInfo().sceneType === sdk.ProjectType.SCENE
    )
    return firstParcelScene
      ? await firstParcelScene.getSceneBaseCoords()
      : { x: 0, y: 0 }
  }

  const saveWorkspace = async () => {
    if (isSingleProject()) {
      throw new Error('Can not save a single project workspace.')
    }

    const folders: WorkspaceProjectSchema[] = []
    for (const project of projects) {
      const projectPath = path.resolve(project.getProjectWorkingDir())
      const workspacePath = path.resolve(path.dirname(workspaceJsonPath))
      if (projectPath.startsWith(workspacePath)) {
        folders.push({
          path: projectPath
            .replace(`${workspacePath}/`, '')
            .replace(`${workspacePath}\\`, '')
        })
      } else {
        folders.push({ path: projectPath })
      }
    }
    const newWorkspace: WorkspaceFileSchema = { folders }
    await fs.writeJSON(workspaceJsonPath, newWorkspace, { spaces: 2 })
  }

  const addProject = async (projectWorkingDir: string) => {
    const workspacePath = path.resolve(path.dirname(workspaceJsonPath))
    const projectResolvedPath = projectWorkingDir.startsWith('/')
      ? projectWorkingDir
      : path.resolve(workspacePath, projectWorkingDir)

    if (!(await fs.pathExists(projectResolvedPath))) {
      throw new Error(
        `Path ${projectWorkingDir} doen't exist. Resolved ${projectResolvedPath}`
      )
    }
    const newProject = new Project(projectResolvedPath)
    await newProject.validateExistingProject()

    projects.push(newProject)
    await saveWorkspace()
  }

  return {
    getAllProjects,
    getProject,
    getSingleProject,
    isSingleProject,
    hasPortableExperience,
    getBaseCoords,
    addProject
  }
}

export async function initializeWorkspace(
  workingDir: string
): Promise<Workspace> {
  const workingDirPaths = await fs.readdir(workingDir)
  const folders: WorkspaceProjectSchema[] = []

  for (const listedPath of workingDirPaths) {
    const projectWorkingDir = path.resolve(workingDir, listedPath)
    if ((await fs.stat(projectWorkingDir)).isDirectory()) {
      const project = new Project(projectWorkingDir)
      if (await project.sceneFileExists()) {
        folders.push({ path: listedPath })
      }
    }
  }

  if (!folders.length) {
    throw new Error(`There isn't any valid project in the sub folders.`)
  }

  const newWorkspace: WorkspaceFileSchema = { folders }
  await fs.writeJSON(
    path.resolve(workingDir, workspaceConfigFile),
    newWorkspace,
    { spaces: 2 }
  )
  await copySample('workspace', workingDir)
  await installDependencies(workingDir, false)

  return createWorkspace({ workingDir })
}
